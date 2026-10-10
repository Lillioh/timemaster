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
  const [y, m, d] = dateStr.split("-").map(Number);
  // Find each calendar boundary independently: a DST day need not be 24h.
  return {
    startUtc: localMidnightUtc(Date.UTC(y, m - 1, d), timeZone),
    endUtc: localMidnightUtc(Date.UTC(y, m - 1, d + 1), timeZone),
  };
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

function localMidnightUtc(localUtcMs: number, timeZone: string): Date {
  let instant = localUtcMs;
  for (let i = 0; i < 4; i++) {
    const corrected = localUtcMs - tzOffsetMs(new Date(instant), timeZone);
    if (corrected === instant) break;
    instant = corrected;
  }
  return new Date(instant);
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
  while (cursor < clockOut) {
    const dateStr = attendanceDateForInstant(cursor, timeZone);
    const { endUtc } = dayBoundsUtc(dateStr, timeZone);
    if (endUtc <= cursor) throw new Error(`Invalid day boundary for ${dateStr} in ${timeZone}`);
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
