/** Pure daily-report calculation, table formatting, and Discord pagination. */
import { dayBoundsUtc, formatDateLong, formatReportTime, manilaDateString, manilaMinutesSinceMidnight } from "./dates.js";

export type SessionBucket = "WORKING" | "CHILLING";

export interface ReportSessionInput {
  clockIn: string;
  clockOut: string | null;
  durationSeconds: number | null;
  status: string;
}

export interface ReportUserInput {
  displayName: string;
  sessions: ReportSessionInput[];
}

export const DISCORD_MESSAGE_LIMIT = 2000;
const HEADER_RESERVE = 200;

export function classifySession(clockInIso: string, timeZone: string): SessionBucket {
  const mins = manilaMinutesSinceMidnight(new Date(clockInIso), timeZone);
  return mins >= 13 * 60 && mins <= 21 * 60 ? "WORKING" : "CHILLING";
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

function exactDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${formatDuration(s)} ${String(s % 60).padStart(2, "0")}s`;
}

interface ReportRow {
  start: number;
  cells: string[];
  seconds: number | null;
  active: boolean;
  bucket: SessionBucket;
}

/**
 * Use the timestamp interval within the report date, rather than pairing an
 * entire overnight interval with one day's stored duration. This also handles
 * legacy split rows whose endpoints were copied from the original session.
 */
function rowsForDate(
  sessions: ReportSessionInput[], targetDate: string, timeZone: string, now: Date,
): ReportRow[] {
  const { startUtc, endUtc } = dayBoundsUtc(targetDate, timeZone);
  const dayStart = +startUtc;
  const dayEnd = +endUtc;
  const seen = new Set<string>();
  const rows: ReportRow[] = [];
  for (const s of [...sessions].sort((a, b) => Date.parse(a.clockIn) - Date.parse(b.clockIn))) {
    const clockIn = Date.parse(s.clockIn);
    const clockOut = s.clockOut == null ? null : Date.parse(s.clockOut);
    if (!Number.isFinite(clockIn) || (clockOut != null && (!Number.isFinite(clockOut) || clockOut < clockIn))) {
      throw new Error("Invalid attendance session timestamps");
    }
    const active = s.status === "ACTIVE";
    const endpoint = active ? +now : clockOut;
    if (clockIn >= dayEnd || (endpoint != null && endpoint < dayStart) ||
      (endpoint === dayStart && clockIn < dayStart)) continue;

    // Old overnight split rows can have identical full-session endpoints.
    // Fetching intervals instead of attendance_date must not double-count them.
    const key = `${clockIn}/${clockOut}/${s.status}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const start = Math.max(clockIn, dayStart);
    const end = endpoint == null ? null : Math.min(endpoint, dayEnd);
    if (end != null && end < start) continue;
    const seconds = s.status === "CANCELLED" || end == null ? null : Math.floor((end - start) / 1000);
    const bucket = classifySession(s.clockIn, timeZone);
    const startLabel = formatReportTime(new Date(start).toISOString(), timeZone) + (clockIn < dayStart ? "*" : "");
    const endLabel = active ? "--" : end == null ? "Missing" :
      end === dayEnd ? "24:00:00*" : formatReportTime(new Date(end).toISOString(), timeZone);
    const state = active ? "Active" : s.status === "CANCELLED" ? "Cancelled" :
      clockOut == null ? "Check log" : clockOut > dayEnd ? "Continues" : "Done";
    rows.push({ start, seconds, active, bucket, cells: [
      String(rows.length + 1), startLabel, endLabel,
      seconds == null ? "--" : exactDuration(seconds), bucket === "WORKING" ? "Working" : "Chilling", state,
    ] });
  }
  return rows;
}

/** Discord displays code fences in monospace; Markdown tables do not render. */
function renderTable(rows: string[][]): string {
  const headers = ["#", "Clock in", "Clock out", "Duration", "Type", "State"];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join(" | ");
  return ["```text", line(headers), widths.map((w) => "-".repeat(w)).join("-+-"), ...rows.map(line), "```"].join("\n");
}

function userBlocks(displayName: string, rows: ReportRow[], maxLength: number): string[] {
  // Keep profile text outside fences and prevent it from changing formatting.
  const name = Array.from(displayName.replace(/[\r\n]/g, " ")).slice(0, 100).join("")
    .replace(/[\\`*_~|<>]/g, "\\$&");
  const caption = `**${name}**`;
  const total = rows.reduce((sum, r) => sum + (r.seconds ?? 0), 0);
  const totalLine = `Total on this date: \`${exactDuration(total)}\`${rows.some((r) => r.active) ? " (includes elapsed active time)" : ""}.`;
  const blocks: string[] = [];
  let current: string[][] = [];
  for (const row of rows) {
    const candidate = `${caption}\n${renderTable([...current, row.cells])}\n${totalLine}`;
    if (current.length && candidate.length > maxLength) {
      blocks.push(`${caption}\n${renderTable(current)}`);
      current = [];
    }
    current.push(row.cells);
  }
  blocks.push(`${caption}\n${renderTable(current)}\n${totalLine}`);
  return blocks;
}

/** One chronological table per person, with complete tables on every page. */
export function buildDailyReportMessages(
  targetDate: string, users: ReportUserInput[], timeZone: string, now = new Date(),
): string[] {
  const longDate = formatDateLong(targetDate);
  const { endUtc } = dayBoundsUtc(targetDate, timeZone);
  const cutoff = new Date(Math.min(+now, +endUtc));
  const ordered = users.map((u) => ({
    displayName: u.displayName,
    rows: rowsForDate(u.sessions, targetDate, timeZone, now),
  })).filter((u) => u.rows.length).sort((a, b) => a.rows[0].start - b.rows[0].start);
  const intro = [
    `Times: **${timeZone}**, 24-hour clock. Durations count only **${longDate}**.`,
    `Report cutoff: ${formatDateLong(manilaDateString(cutoff, timeZone))}, ${formatReportTime(cutoff.toISOString(), timeZone)}. Durations are rounded down to whole seconds.`,
    `\`*\` = day boundary for an overnight session; 24:00 means next midnight, not a new join/leave.`,
    `Active rows have no clock-out; their elapsed time stops at the report cutoff. Type is based on the recorded clock-in (Working: 13:00–21:00).`,
  ].join("\n");
  const allRows = ordered.flatMap((u) => u.rows);
  const summary = [
    "**Summary**",
    `• Total members tracked: \`${ordered.length}\``,
    `• Working sessions: \`${allRows.filter((r) => !r.active && r.bucket === "WORKING").length}\``,
    `• Chilling sessions: \`${allRows.filter((r) => !r.active && r.bucket === "CHILLING").length}\``,
    `• Still active: \`${allRows.filter((r) => r.active).length}\``,
  ].join("\n");
  const maxBody = DISCORD_MESSAGE_LIMIT - HEADER_RESERVE;
  const blocks = [intro];
  if (!ordered.length) blocks.push(
    "> No members were present in the Work Voice Channel on this date.",
  );
  for (const user of ordered) blocks.push(...userBlocks(user.displayName, user.rows, maxBody));
  blocks.push(summary);
  const title = `📋 **DAILY VC ATTENDANCE**\n**${longDate}** · ${timeZone}\n\n`;
  const single = title + blocks.join("\n\n");
  if (single.length <= DISCORD_MESSAGE_LIMIT) return [single];

  const pages: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + 2 + block.length > maxBody) {
      pages.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current) pages.push(current);
  return pages.map((body, i) =>
    `${title}Part ${i + 1}/${pages.length}\n\n${body}`,
  );
}
