import type { SupabaseClient } from "@supabase/supabase-js";
import { attendanceDateForInstant } from "./calculate-duration";
import { getAppTimezone } from "./constants";

export async function recalculateDaily(
  db: SupabaseClient,
  userId: string,
  attendanceDate: string,
  requiredSeconds: number,
) {
  const { data: sessions, error } = await db
    .from("attendance_sessions")
    .select("duration_seconds,status,clock_in,clock_out")
    .eq("user_id", userId)
    .eq("attendance_date", attendanceDate)
    .eq("status", "COMPLETED");
  if (error) throw error;
  const total = (sessions ?? []).reduce(
    (acc, s) => acc + Math.max(0, s.duration_seconds ?? 0),
    0,
  );
  const status = total >= requiredSeconds ? "COMPLETE" : "INCOMPLETE";
  const { error: upsertError } = await db.from("daily_attendance").upsert(
    {
      user_id: userId,
      attendance_date: attendanceDate,
      total_seconds: total,
      required_seconds: requiredSeconds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,attendance_date" },
  );
  if (upsertError) throw upsertError;
  return { total_seconds: total, status };
}

/** Recompute ALL daily rows touched by a session that may span midnight. */
export async function recalculateDates(
  db: SupabaseClient,
  userId: string,
  dates: string[],
  requiredSeconds: number,
) {
  const out: Record<string, { total_seconds: number; status: string }> = {};
  for (const d of new Set(dates)) {
    out[d] = await recalculateDaily(db, userId, d, requiredSeconds);
  }
  return out;
}

export function todayInAppTz(now = new Date(), tz = getAppTimezone()) {
  return attendanceDateForInstant(now, tz);
}
