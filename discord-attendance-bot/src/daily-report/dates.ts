/**
 * Asia/Manila (or configured APP_TIMEZONE) calendar helpers.
 *
 * All schedule/date calculations for the daily report use these — never the
 * host machine's local timezone. Database timestamps stay UTC; conversion to
 * the app timezone happens only here, at the presentation/scheduling layer.
 *
 * Pure functions — safe to unit test.
 */

export function manilaDateString(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Noon UTC avoids any DST edge when doing calendar arithmetic.
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/** UTC instants bounding a calendar date in the report timezone. */
export function dayBoundsUtc(dateStr: string, timeZone: string): { startUtc: Date; endUtc: Date } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const midnight = (date: string): Date => {
    const localUtcMs = Date.parse(`${date}T00:00:00Z`);
    let instant = localUtcMs;
    for (let i = 0; i < 4; i++) {
      const parts = formatter.formatToParts(new Date(instant));
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
      const represented = Date.UTC(get("year"), get("month") - 1, get("day"),
        get("hour"), get("minute"), get("second"));
      const corrected = localUtcMs - (represented - instant);
      if (corrected === instant) break;
      instant = corrected;
    }
    return new Date(instant);
  };
  return { startUtc: midnight(dateStr), endUtc: midnight(addDays(dateStr, 1)) };
}

/** Exact, 24-hour clock for table cells; avoids hiding sub-minute sessions. */
export function formatReportTime(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    ...(instant.getMilliseconds() ? { fractionalSecondDigits: 3 as const } : {}),
  }).format(instant);
}

export function previousDateString(dateStr: string): string {
  return addDays(dateStr, -1);
}

/** e.g. "October 6, 2026" for a YYYY-MM-DD calendar date. */
export function formatDateLong(dateStr: string): string {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function tzParts(instant: Date, timeZone: string): Map<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const map = new Map<string, string>();
  for (const p of parts) map.set(p.type, p.value);
  return map;
}

/** Whole minutes since local midnight for an instant in the given timezone. */
export function manilaMinutesSinceMidnight(instant: Date, timeZone: string): number {
  const parts = tzParts(instant, timeZone);
  // hour12:false can yield "24" at midnight in some locales — normalize.
  const hour = Number(parts.get("hour") ?? "0") % 24;
  const minute = Number(parts.get("minute") ?? "0");
  return hour * 60 + minute;
}

/** e.g. "1:03 PM" for a UTC ISO instant, rendered in the given timezone. */
export function formatManilaTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Milliseconds from `now` until the next 00:00 in the given timezone. */
export function msUntilNextMidnight(now: Date, timeZone: string): number {
  const parts = tzParts(now, timeZone);
  const hour = Number(parts.get("hour") ?? "0") % 24;
  const minute = Number(parts.get("minute") ?? "0");
  const second = Number(parts.get("second") ?? "0");
  // The ms fraction of an instant is identical in every timezone.
  const elapsed = ((hour * 60 + minute) * 60 + second) * 1000 + now.getMilliseconds();
  const dayMs = 24 * 3600 * 1000;
  return dayMs - (elapsed % dayMs);
}

// --- Retention policy (calendar-day based, never "older than N hours") ---

/**
 * Retention cutoff for a given "today" (both YYYY-MM-DD in the app timezone).
 * Keeps today + previous 2 days; anything strictly before the cutoff date
 * is eligible for deletion. Example: today Oct 6 → cutoff Oct 4 → Oct 3 and
 * earlier are eligible.
 */
export function retentionCutoff(todayStr: string): string {
  return addDays(todayStr, -2);
}

/** Deletion predicate: old enough AND never an ACTIVE session. */
export function isEligibleForDeletion(
  attendanceDate: string,
  cutoffDate: string,
  status: string,
): boolean {
  return status !== "ACTIVE" && attendanceDate < cutoffDate;
}
