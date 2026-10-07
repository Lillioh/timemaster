import type { SupabaseClient } from "@supabase/supabase-js";
import { attendanceDateForInstant } from "./calculate-duration";
import { getAppTimezone } from "./constants";
import { recalculateDaily } from "./daily-total";

export interface ClockInInput {
  discordUserId: string;
  guildId: string;
  channelId: string;
  channelName?: string;
  now?: Date;
}

export async function clockIn(db: SupabaseClient, input: ClockInInput) {
  const now = input.now ?? new Date();
  const tz = getAppTimezone();
  const attendanceDate = attendanceDateForInstant(now, tz);

  // 1. Resolve registered, active user.
  const { data: user, error: userError } = await db
    .from("users")
    .select("id,required_override,active")
    .eq("discord_user_id", input.discordUserId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) return { ok: false as const, reason: "unknown_user" };
  if (user.active === false) return { ok: false as const, reason: "user_inactive" };

  // 2. Resolve required seconds (user override > active discord config > default 28800).
  const { data: cfg } = await db
    .from("discord_configuration")
    .select("required_daily_seconds")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const requiredSeconds =
    (user as { required_override?: number | null }).required_override ??
    cfg?.required_daily_seconds ??
    28800;

  // 3. Idempotency: at most one ACTIVE session per user (partial unique index enforces).
  const { data: existing } = await db
    .from("attendance_sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { ok: true as const, deduped: true, session_id: existing.id };
  }

  const { data: created, error: insertError } = await db
    .from("attendance_sessions")
    .insert({
      user_id: user.id,
      discord_user_id: input.discordUserId,
      guild_id: input.guildId,
      voice_channel_id: input.channelId,
      voice_channel_name: input.channelName ?? null,
      clock_in: now.toISOString(),
      attendance_date: attendanceDate,
      status: "ACTIVE",
    })
    .select("id")
    .single();
  if (insertError) {
    // Unique violation => raced with another JOIN; treat as deduped.
    if (insertError.code === "23505") {
      const { data: race } = await db
        .from("attendance_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .limit(1)
        .maybeSingle();
      return { ok: true as const, deduped: true, session_id: race?.id ?? null };
    }
    throw insertError;
  }

  // Ensure a daily row exists (total stays until clock-out).
  await db.from("daily_attendance").upsert(
    {
      user_id: user.id,
      attendance_date: attendanceDate,
      required_seconds: requiredSeconds,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id,attendance_date", ignoreDuplicates: false },
  );
  // Recalc to keep status consistent (no-op on totals, but cheap + safe).
  await recalculateDaily(db, user.id, attendanceDate, requiredSeconds).catch(() => {});

  return { ok: true as const, deduped: false, session_id: created.id };
}
