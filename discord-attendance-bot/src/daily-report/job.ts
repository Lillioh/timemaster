/**
 * Midnight daily-report job: generate the previous Manila calendar day's
 * attendance report from Supabase, post it to Discord, archive the delivery
 * in the ledger, then prune old detailed sessions.
 *
 * Strict order (cleanup safety):
 *   generate → send to Discord → confirm success → mark archived → delete.
 * A failed Discord send marks nothing and deletes nothing.
 *
 * Never touches clockIn/clockOut/reconciliation behavior.
 */

import type { Client } from "discord.js";
import { config } from "../config.js";
import { getSupabase } from "./supabase.js";
import { fetchSessionsForDate, resolveHumans } from "./sessions.js";
import {
  manilaDateString,
  msUntilNextMidnight,
  previousDateString,
  retentionCutoff,
} from "./dates.js";
import { buildDailyReportMessages } from "./report.js";

const SAFETY_NET_INTERVAL_MS = 3600_000; // hourly retry for a missed/failed report

let dailyReportRunning = false;

async function isReportSent(targetDate: string): Promise<boolean> {
  const db = getSupabase();
  const { data, error } = await db
    .from("daily_attendance_reports")
    .select("attendance_date")
    .eq("attendance_date", targetDate)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

async function markReportSent(
  targetDate: string,
  channelId: string,
  messageCount: number,
): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from("daily_attendance_reports").insert({
    attendance_date: targetDate,
    discord_channel_id: channelId,
    message_count: messageCount,
    sent_at: new Date().toISOString(),
  });
  // Unique violation = another execution already archived it; not an error.
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

/** Delete detailed sessions older than the 2-day window. Never ACTIVE ones. */
async function cleanupOldSessions(todayStr: string): Promise<number> {
  const cutoff = retentionCutoff(todayStr);
  console.log(`[retention] deleting sessions before attendance_date=${cutoff}`);
  const db = getSupabase();
  const { data, error } = await db
    .from("attendance_sessions")
    .delete()
    .lt("attendance_date", cutoff)
    .neq("status", "ACTIVE")
    .select("id");
  if (error) throw error;
  const deleted = (data ?? []).length;
  console.log(`[retention] deleted=${deleted}`);
  return deleted;
}

export async function runDailyReport(targetDate: string, client: Client): Promise<void> {
  if (dailyReportRunning) {
    console.log(`[daily-report] skipped date=${targetDate}: another run in flight`);
    return;
  }
  dailyReportRunning = true;
  try {
    console.log(`[daily-report] starting date=${targetDate}`);
    if (await isReportSent(targetDate)) {
      console.log(`[daily-report] already sent date=${targetDate}, skipping`);
      return;
    }

    const rows = await fetchSessionsForDate(getSupabase(), targetDate, config.appTimezone);
    console.log(`[daily-report] sessions=${rows.length}`);
    const users = await resolveHumans(client, rows);
    const messages = buildDailyReportMessages(targetDate, users, config.appTimezone);

    const channel = await client.channels.fetch(config.reportChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      console.error(
        `[daily-report] failed date=${targetDate} error=report channel ${config.reportChannelId} not found or not text-capable`,
      );
      return;
    }
    for (const content of messages) {
      await channel.send({ content, allowedMentions: { parse: [] } });
    }
    console.log(
      `[daily-report] sent channel=${config.reportChannelId} messages=${messages.length}`,
    );

    await markReportSent(targetDate, config.reportChannelId, messages.length);
    console.log(`[daily-report] archived date=${targetDate}`);

    // Cleanup only after confirmed delivery + archiving. Cleanup failure
    // must not affect the already-delivered report; the next run retries.
    try {
      const todayStr = manilaDateString(new Date(), config.appTimezone);
      await cleanupOldSessions(todayStr);
    } catch (err) {
      console.error(
        `[retention] failed error=${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } catch (err) {
    console.error(
      `[daily-report] failed date=${targetDate} error=${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    dailyReportRunning = false;
  }
}

/** Yesterday in the app timezone — the date the midnight job reports on. */
function yesterdayInAppTz(now: Date): string {
  return previousDateString(manilaDateString(now, config.appTimezone));
}

/**
 * Persistent-process scheduler: fires at 00:00 app-timezone daily.
 * - Startup catch-up: if the previous day's report is unsent (e.g. the bot
 *   restarted after midnight), send it now (ledger-guarded, no duplicates).
 * - Self-rescheduling midnight timer (no drift; host TZ never consulted).
 * - Hourly safety net re-checks the previous day (covers a failed midnight
 *   run without ever duplicating a sent report).
 */
export function startDailyReportScheduler(client: Client): void {
  void runDailyReport(yesterdayInAppTz(new Date()), client);

  const scheduleNext = (): void => {
    const wait = msUntilNextMidnight(new Date(), config.appTimezone);
    setTimeout(() => {
      void runDailyReport(yesterdayInAppTz(new Date()), client).finally(scheduleNext);
    }, wait);
  };
  scheduleNext();

  setInterval(() => {
    void runDailyReport(yesterdayInAppTz(new Date()), client);
  }, SAFETY_NET_INTERVAL_MS).unref();
}
