/**
 * Pure daily-report content logic: session classification, Discord markdown
 * formatting, and message splitting. No I/O — safe to unit test.
 */

import {
  formatDateLong,
  formatManilaTime,
  manilaMinutesSinceMidnight,
} from "./dates.js";

export type SessionBucket = "WORKING" | "CHILLING";

export interface ReportSessionInput {
  clockIn: string; // ISO-8601 UTC
  clockOut: string | null; // null while ACTIVE
  durationSeconds: number | null; // null while ACTIVE
  status: string; // "ACTIVE" | "COMPLETED" | ...
}

export interface ReportUserInput {
  displayName: string;
  sessions: ReportSessionInput[];
}

export const DISCORD_MESSAGE_LIMIT = 2000;
// Room reserved for the "Part i/n" continuation header on each message.
const HEADER_RESERVE = 150;

// WORKING = clock-in from 1:00 PM through 9:00 PM inclusive (Manila).
// Anything earlier/later (by clock-in time) is CHILLING.
const WORK_START_MIN = 13 * 60;
const WORK_END_MIN = 21 * 60;

export function classifySession(clockInIso: string, timeZone: string): SessionBucket {
  const mins = manilaMinutesSinceMidnight(new Date(clockInIso), timeZone);
  return mins >= WORK_START_MIN && mins <= WORK_END_MIN ? "WORKING" : "CHILLING";
}

/** e.g. 16740 → "4h 39m". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

interface SessionLine {
  bucket: SessionBucket;
  active: boolean;
  clockInMs: number;
  text: string; // single-line content (without the leading "• ")
}

function sessionLine(
  s: ReportSessionInput,
  index: number,
  multi: boolean,
  timeZone: string,
): SessionLine {
  const active = s.status === "ACTIVE";
  const clockInLabel = formatManilaTime(s.clockIn, timeZone);
  const clockOutLabel = active
    ? "Still active"
    : s.clockOut
      ? formatManilaTime(s.clockOut, timeZone)
      : "—";
  const durationLabel =
    active || s.durationSeconds == null ? "Still active" : formatDuration(s.durationSeconds);
  const prefix = multi ? `Session ${index + 1} — ` : "";
  return {
    bucket: classifySession(s.clockIn, timeZone),
    active,
    clockInMs: new Date(s.clockIn).getTime(),
    text: `${prefix}🟢 \`${clockInLabel}\` → 🔴 \`${clockOutLabel}\` — \`${durationLabel}\``,
  };
}

function singleSessionBlock(displayName: string, s: ReportSessionInput, timeZone: string): string {
  const active = s.status === "ACTIVE";
  const clockInLabel = formatManilaTime(s.clockIn, timeZone);
  const clockOutLabel = active
    ? "Still active"
    : s.clockOut
      ? formatManilaTime(s.clockOut, timeZone)
      : "—";
  const durationLabel =
    active || s.durationSeconds == null ? "Still active" : formatDuration(s.durationSeconds);
  return [
    `**${displayName}**`,
    `• 🟢 Clock in: \`${clockInLabel}\``,
    `• 🔴 Clock out: \`${clockOutLabel}\``,
    `• ⏱️ Duration: \`${durationLabel}\``,
  ].join("\n");
}

/**
 * Build the full Discord report for a Manila calendar date.
 * Returns one message, or several labeled "Part i/n" when too long.
 * Never truncates records; keeps each user's block together when possible.
 */
export function buildDailyReportMessages(
  targetDate: string,
  users: ReportUserInput[],
  timeZone: string,
): string[] {
  const longDate = formatDateLong(targetDate);

  // Chronological user order (by earliest clock-in); sessions sorted too.
  const ordered = [...users]
    .map((u) => ({
      displayName: u.displayName,
      sessions: [...u.sessions].sort((a, b) => +new Date(a.clockIn) - +new Date(b.clockIn)),
    }))
    .filter((u) => u.sessions.length > 0)
    .sort((a, b) => +new Date(a.sessions[0].clockIn) - +new Date(b.sessions[0].clockIn));

  if (ordered.length === 0) {
    return [
      [
        `📋 **DAILY VC ATTENDANCE**`,
        `**${longDate}**`,
        ``,
        `> No members entered the Work Voice Channel on this date.`,
        ``,
        `**Summary**`,
        `• Total members tracked: \`0\``,
      ].join("\n"),
    ];
  }

  const workingBlocks: string[] = [];
  const chillingBlocks: string[] = [];
  const activeBlocks: string[] = [];
  let workingCount = 0;
  let chillingCount = 0;
  let activeCount = 0;

  for (const u of ordered) {
    // Bucket this user's sessions; a user may appear in two sections
    // (completed sessions in WORKING/CHILLING, the live one in STILL ACTIVE).
    const byBucket = new Map<SessionBucket, SessionLine[]>();
    const actives: SessionLine[] = [];
    u.sessions.forEach((s, i) => {
      const line = sessionLine(s, i, u.sessions.length > 1, timeZone);
      if (line.active) {
        actives.push(line);
        activeCount += 1;
      } else {
        const list = byBucket.get(line.bucket) ?? [];
        list.push(line);
        byBucket.set(line.bucket, list);
        if (line.bucket === "WORKING") workingCount += 1;
        else chillingCount += 1;
      }
    });

    const blockFor = (lines: SessionLine[]): string =>
      [`**${u.displayName}**`, ...lines.map((l) => `• ${l.text}`)].join("\n");

    const working = byBucket.get("WORKING") ?? [];
    const chilling = byBucket.get("CHILLING") ?? [];
    if (working.length > 0 && chilling.length === 0 && actives.length === 0 && u.sessions.length === 1) {
      workingBlocks.push(singleSessionBlock(u.displayName, u.sessions[0], timeZone));
    } else if (chilling.length > 0 && working.length === 0 && actives.length === 0 && u.sessions.length === 1) {
      chillingBlocks.push(singleSessionBlock(u.displayName, u.sessions[0], timeZone));
    } else {
      if (working.length > 0) workingBlocks.push(blockFor(working));
      if (chilling.length > 0) chillingBlocks.push(blockFor(chilling));
      if (actives.length > 0) {
        activeBlocks.push(
          actives.length === 1 && u.sessions.length === 1
            ? singleSessionBlock(u.displayName, u.sessions[0], timeZone)
            : blockFor(actives),
        );
      }
    }
  }

  const quote = `> Attendance log for members who entered the Work Voice Channel on this date.`;
  const summary = [
    `**Summary**`,
    `• Total members tracked: \`${ordered.length}\``,
    `• Working sessions: \`${workingCount}\``,
    `• Chilling sessions: \`${chillingCount}\``,
    `• Still active: \`${activeCount}\``,
    ``,
    `> This log is generated for attendance tracking purposes and records members who entered the Work Voice Channel during the day.`,
  ].join("\n");

  const contentBlocks: string[] = [quote];
  if (workingBlocks.length > 0) {
    contentBlocks.push(`**🟢 WORKING**\n\n${workingBlocks.join("\n\n")}`);
  }
  if (chillingBlocks.length > 0) {
    contentBlocks.push(`**🟡 CHILLING**\n\n${chillingBlocks.join("\n\n")}`);
  }
  if (activeBlocks.length > 0) {
    contentBlocks.push(`**🔵 STILL ACTIVE**\n\n${activeBlocks.join("\n\n")}`);
  }
  contentBlocks.push(summary);

  const titleHeader = `📋 **DAILY VC ATTENDANCE**\n**${longDate}**\n\n`;
  const single = titleHeader + contentBlocks.join("\n\n");
  if (single.length <= DISCORD_MESSAGE_LIMIT) return [single];

  // Paginate: keep each block whole when it fits; hard-split only a
  // pathological oversized block by lines.
  const maxBody = DISCORD_MESSAGE_LIMIT - HEADER_RESERVE;
  const pages: string[] = [];
  let current: string[] = [];
  let currentLen = 0;
  const pushLines = (text: string): void => {
    for (const chunk of chunkBlock(text, maxBody)) {
      if (currentLen > 0 && currentLen + 2 + chunk.length > maxBody) {
        pages.push(current.join("\n\n"));
        current = [];
        currentLen = 0;
      }
      current.push(chunk);
      currentLen += (currentLen > 0 ? 2 : 0) + chunk.length;
    }
  };
  for (const b of contentBlocks) pushLines(b);
  if (current.length > 0) pages.push(current.join("\n\n"));

  return pages.map(
    (body, i) =>
      `📋 **DAILY VC ATTENDANCE — ${longDate}**\nPart ${i + 1}/${pages.length}\n\n${body}`,
  );
}

/** Split one oversized block into line-preserving chunks within maxLen. */
function chunkBlock(block: string, maxLen: number): string[] {
  if (block.length <= maxLen) return [block];
  const chunks: string[] = [];
  let cur = "";
  for (const line of block.split("\n")) {
    if (line.length > maxLen) {
      // Single pathological line: hard-slice it (never drop content).
      if (cur) {
        chunks.push(cur);
        cur = "";
      }
      for (let i = 0; i < line.length; i += maxLen) {
        chunks.push(line.slice(i, i + maxLen));
      }
      continue;
    }
    if (cur && cur.length + 1 + line.length > maxLen) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
