import { getAppTimezone } from "./constants";

/** YYYY-MM-DD for a given instant in the app timezone. */
export function attendanceDateForInstant(
  instant: Date,
  timeZone: string = getAppTimezone(),
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return parts; // en-CA => YYYY-MM-DD
}

/** Midnight boundary helpers: returns the UTC instants delimiting a local date. */
export function dayBoundsUtc(dateStr: string, timeZone: string): { startUtc: Date; endUtc: Date } {
  // Robust approach: binary-search-free iterative method using Intl.
  // We find UTC times t such that local date == dateStr at boundaries.
  // Strategy: start from noon UTC guess and adjust.
  const [y, m, d] = dateStr.split("-").map(Number);
  // Guess: Date.UTC(y, m-1, d, 12) then compute offset.
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMs = tzOffsetMs(guess, timeZone);
  const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMsForMidnight(y, m, d, timeZone));
  void offsetMs;
  // Correct by probing: find start = latest UTC instant whose local date <= date, at 00:00 local.
  return { startUtc, endUtc: new Date(startUtc.getTime() + 24 * 3600 * 1000) };
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - date.getTime();
}

function offsetMsForMidnight(y: number, m: number, d: number, timeZone: string): number {
  // offset such that local midnight == UTC midnight - offset
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return tzOffsetMs(probe, timeZone);
}

/** Split [clockIn, clockOut) across local dates, returning Map<dateStr, seconds>. */
export function splitDurationByDate(
  clockIn: Date,
  clockOut: Date,
  timeZone: string = getAppTimezone(),
): Map<string, number> {
  const result = new Map<string, number>();
  if (clockOut <= clockIn) return result;
  let cursor = new Date(clockIn);
  // Safety guard: max 7 day iterations (sessions should never be that long, but cap anyway).
  for (let i = 0; i < 8 && cursor < clockOut; i++) {
    const dateStr = attendanceDateForInstant(cursor, timeZone);
    const { endUtc } = dayBoundsUtc(dateStr, timeZone);
    const segmentEnd = endUtc < clockOut ? endUtc : clockOut;
    const secs = Math.max(0, Math.floor((segmentEnd.getTime() - cursor.getTime()) / 1000));
    result.set(dateStr, (result.get(dateStr) ?? 0) + secs);
    cursor = segmentEnd;
  }
  return result;
}

/** Whole-second duration, never negative. */
export function calculateDurationSeconds(clockIn: Date, clockOut: Date): number {
  return Math.max(0, Math.floor((clockOut.getTime() - clockIn.getTime()) / 1000));
}

export function dailyStatusFor(totalSeconds: number, requiredSeconds: number): "COMPLETE" | "INCOMPLETE" {
  return totalSeconds >= requiredSeconds ? "COMPLETE" : "INCOMPLETE";
}
