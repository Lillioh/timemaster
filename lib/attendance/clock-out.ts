import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateDurationSeconds,
  dayBoundsUtc,
  splitDurationByDate,
} from "./calculate-duration";
import { getAppTimezone } from "./constants";
import { recalculateDates } from "./daily-total";

export interface ClockOutInput {
  discordUserId: string;
  now?: Date;
}

export async function clockOut(db: SupabaseClient, input: ClockOutInput) {
  const now = input.now ?? new Date();

  const { data: user, error: userError } = await db
    .from("users")
    .select("id,active")
    .eq("discord_user_id", input.discordUserId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) return { ok: false as const, reason: "unknown_user" };

  const { data: active, error: activeError } = await db
    .from("attendance_sessions")
    .select("id,clock_in,attendance_date,user_id")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .order("clock_in", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (!active) return { ok: true as const, deduped: true, closed: false };

  const clockIn = new Date(active.clock_in);
  const duration = calculateDurationSeconds(clockIn, now);

  const { data: cfg } = await db
    .from("discord_configuration")
    .select("required_daily_seconds")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const requiredSeconds = cfg?.required_daily_seconds ?? 28800;

  const tz = getAppTimezone();
  const split = splitDurationByDate(clockIn, now, tz);

  if (split.size <= 1) {
    // Normal same-day close.
    const { error: updateError } = await db
      .from("attendance_sessions")
      .update({
        clock_out: now.toISOString(),
        duration_seconds: duration,
        status: "COMPLETED",
        updated_at: now.toISOString(),
      })
      .eq("id", active.id)
      .eq("status", "ACTIVE"); // guard against double-close
    if (updateError) throw updateError;
    await recalculateDates(db, user.id, [active.attendance_date], requiredSeconds);
    return { ok: true as const, deduped: false, closed: true, session_id: active.id, duration_seconds: duration };
  }

  // Midnight-crossing: close original session at local midnight boundary and
  // create continuation COMPLETED sessions for the remaining dates so each
  // date's SUM(duration) is correct.
  const entries = [...split.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  // First segment keeps the original row.
  const firstDate = entries[0][0];
  const firstSecs = entries[0][1];
  const firstEnd = dayBoundsUtc(firstDate, tz).endUtc;
  const { error: updateError } = await db
    .from("attendance_sessions")
    .update({
      clock_out: firstEnd.toISOString(),
      duration_seconds: firstSecs,
      attendance_date: firstDate,
      status: "COMPLETED",
      updated_at: now.toISOString(),
    })
    .eq("id", active.id)
    .eq("status", "ACTIVE");
  if (updateError) throw updateError;

  // Fetch original row context for continuation rows.
  const { data: orig, error: origError } = await db
    .from("attendance_sessions")
    .select("user_id,discord_user_id,guild_id,voice_channel_id,voice_channel_name,clock_in")
    .eq("id", active.id)
    .single();
  if (origError) throw origError;

  for (const [dateStr, secs] of entries.slice(1)) {
    const { startUtc, endUtc } = dayBoundsUtc(dateStr, tz);
    const segmentEnd = endUtc < now ? endUtc : now;
    const { error: insertError } = await db.from("attendance_sessions").insert({
      user_id: orig?.user_id ?? user.id,
      discord_user_id: orig?.discord_user_id ?? input.discordUserId,
      guild_id: orig?.guild_id ?? "",
      voice_channel_id: orig?.voice_channel_id ?? "",
      voice_channel_name: orig?.voice_channel_name ?? null,
      clock_in: startUtc.toISOString(),
      clock_out: segmentEnd.toISOString(),
      duration_seconds: secs,
      attendance_date: dateStr,
      status: "COMPLETED",
    });
    if (insertError) throw insertError;
  }
  await recalculateDates(
    db,
    user.id,
    entries.map(([d]) => d),
    requiredSeconds,
  );
  return { ok: true as const, deduped: false, closed: true, session_id: active.id, duration_seconds: duration, split: Object.fromEntries(entries) };
}
