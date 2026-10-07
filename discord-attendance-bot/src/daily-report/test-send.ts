/**
 * ONE-TIME SMOKE TEST — Discord channel write for the daily attendance report.
 *
 * Reads 2026-10-05 sessions from Supabase, builds the report with the
 * production builder, and sends it to the configured report channel.
 *
 * DATABASE SAFETY: this script performs SELECTs and Discord sends ONLY.
 * It deliberately does NOT import job.ts, so it cannot call
 * runDailyReport() / markReportSent() / cleanupOldSessions(), and it never
 * inserts into daily_attendance_reports nor modifies attendance_sessions,
 * daily_attendance, or users.
 *
 * Run manually after review:  npm run report:test-send
 * Delete this file after the smoke test succeeds.
 */

import { Client, GatewayIntentBits } from "discord.js";
import { config } from "../config.js";
import { getSupabase } from "./supabase.js";
import { buildDailyReportMessages, type ReportUserInput } from "./report.js";

// Explicit smoke-test target date (not derived from the current day).
const TARGET_DATE = "2026-10-05";

// Same raw join shape as the production fetcher in job.ts.
interface RawSessionRow {
  id: string;
  clock_in: string;
  clock_out: string | null;
  duration_seconds: number | null;
  status: string;
  attendance_date: string;
  discord_user_id: string;
  users: Array<{
    display_name: string | null;
    discord_username: string | null;
  }> | null;
}

async function main(): Promise<void> {
  console.log(`[test-send] target date=${TARGET_DATE}`);
  console.log("DRY DATA CHECK: no database writes or deletes will be performed.");

  // SELECT only — no inserts/updates/deletes anywhere in this script.
  const db = getSupabase();
  const { data, error } = await db
    .from("attendance_sessions")
    .select(
      "id,clock_in,clock_out,duration_seconds,status,attendance_date,discord_user_id,users(display_name,discord_username)",
    )
    .eq("attendance_date", TARGET_DATE)
    .order("clock_in", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as RawSessionRow[];
  console.log(`[test-send] sessions found=${rows.length}`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  try {
    await client.login(config.botToken);

    // Same bot filter as production: Discord's authoritative user.bot flag.
    // Fail open on fetch errors — never silently drop attendance data.
    const byDiscord = new Map<string, RawSessionRow[]>();
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
      const profile = Array.isArray(sessions[0]?.users)
        ? (sessions[0].users[0] ?? null)
        : (sessions[0]?.users ?? null);
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
    console.log(`[test-send] users included=${users.length} skipped bots=${skippedBots}`);

    const messages = buildDailyReportMessages(TARGET_DATE, users, config.appTimezone);
    console.log(
      `[test-send] messages=${messages.length} channel=${config.reportChannelId}`,
    );

    const channel = await client.channels.fetch(config.reportChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      console.error(
        `[test-send] channel ${config.reportChannelId} not found or not text-capable — nothing sent`,
      );
      process.exitCode = 1;
      return;
    }

    let sent = 0;
    for (let i = 0; i < messages.length; i++) {
      try {
        await channel.send({ content: messages[i] });
        sent += 1;
        console.log(`[test-send] sent part ${i + 1}/${messages.length} ok`);
      } catch (err) {
        console.error(
          `[test-send] failed part ${i + 1}/${messages.length}: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    }
    console.log(`[test-send] done sent=${sent}/${messages.length}`);
  } finally {
    client.destroy();
  }
}

try {
  await main();
} catch (err) {
  console.error(
    `[test-send] fatal: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
}
