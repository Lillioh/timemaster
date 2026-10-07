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
import {
  manilaDateString,
  msUntilNextMidnight,
  previousDateString,
  retentionCutoff,
} from "./dates.js";
import {
  buildDailyReportMessages,
  type ReportUserInput,
} from "./report.js";

const SAFETY_NET_INTERVAL_MS = 3600_000; // hourly retry for a missed/failed report

let dailyReportRunning = false;

interface SessionRow {
  id: string;
  clock_in: string;
  clock_out: string | null;
  duration_seconds: number | null;
  status: string;
  attendance_date: string;
  discord_user_id: string;
  users: {
    display_name: string | null;
    discord_username: string | null;
  } | null;
}

// Raw shape as returned by the Supabase join (embedded relation is an array).
interface RawSessionRow extends Omit<SessionRow, "users"> {
  users: Array<{ display_name: string | null; discord_username: string | null }> | null;
}

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

async function fetchSessionsForDate(targetDate: string): Promise<SessionRow[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("attendance_sessions")
    .select(
      "id,clock_in,clock_out,duration_seconds,status,attendance_date,discord_user_id,users(display_name,discord_username)",
    )
    .eq("attendance_date", targetDate)
    .order("clock_in", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RawSessionRow[]).map((r) => ({
    ...r,
    users: Array.isArray(r.users) ? (r.users[0] ?? null) : r.users,
  }));
}

/**
 * Keep only real humans. The users table has no bot flag (active=false also
 * marks deactivated humans), so use Discord's authoritative user.bot flag.
 * Fail open on fetch errors: never silently drop attendance data.
 */
async function resolveHumans(client: Client, rows: SessionRow[]): Promise<ReportUserInput[]> {
  const byDiscord = new Map<string, SessionRow[]>();
  for (const r of rows) {
    const list = byDiscord.get(r.discord_user_id) ?? [];
    list.push(r);
    byDiscord.set(r.discord_user_id, list);
  }

  const users: ReportUserInput[] = [];
  let skippedBots = 0;
  for (const [discordId, sessions] of byDiscord) {
    const discordUser = await client.users.fetch(discordId).catch(() => null);
    if (discordUser?.bot) {
      skippedBots += 1;
      continue;
    }
    if (!discordUser) {
      console.warn(`[daily-report] user fetch failed, including sessions anyway user=${discordId}`);
    }
    const profile = sessions[0]?.users ?? null;
    users.push({
      displayName: profile?.display_name ?? profile?.discord_username ?? discordId,
      sessions: sessions.map((s) => ({
        clockIn: s.clock_in,
        clockOut: s.clock_out,
        durationSeconds: s.duration_seconds,
        status: s.status,
      })),
    });
  }
  if (skippedBots > 0) console.log(`[daily-report] skipped bot accounts=${skippedBots}`);
  return users;
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

    const rows = await fetchSessionsForDate(targetDate);
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
      await channel.send({ content });
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
