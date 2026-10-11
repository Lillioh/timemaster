/**
 * Unit tests for the daily-report pure logic (no Discord / Supabase I/O).
 * Run: npm test  (tsx --test)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  dayBoundsUtc,
  formatManilaTime,
  isEligibleForDeletion,
  manilaDateString,
  msUntilNextMidnight,
  previousDateString,
  retentionCutoff,
} from "./dates.js";
import {
  buildDailyReportMessages,
  classifySession,
  DISCORD_MESSAGE_LIMIT,
  formatDuration,
  type ReportUserInput,
} from "./report.js";

const TZ = "Asia/Manila";

describe("classification boundaries (by clock-in, Manila)", () => {
  it("12:59 PM is CHILLING", () => {
    // 12:59 Manila = 04:59 UTC
    assert.equal(classifySession("2026-10-06T04:59:00Z", TZ), "CHILLING");
  });
  it("1:00 PM is WORKING", () => {
    assert.equal(classifySession("2026-10-06T05:00:00Z", TZ), "WORKING");
  });
  it("9:00 PM is WORKING", () => {
    assert.equal(classifySession("2026-10-06T13:00:00Z", TZ), "WORKING");
  });
  it("9:01 PM is CHILLING", () => {
    assert.equal(classifySession("2026-10-06T13:01:00Z", TZ), "CHILLING");
  });
  it("morning is CHILLING", () => {
    assert.equal(classifySession("2026-10-06T02:30:00Z", TZ), "CHILLING"); // 10:30 AM
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    assert.equal(formatDuration(16740), "4h 39m");
    assert.equal(formatDuration(4500), "1h 15m");
    assert.equal(formatDuration(0), "0h 00m");
  });
  it("formats Manila clock times", () => {
    assert.equal(formatManilaTime("2026-10-06T05:03:00Z", TZ), "1:03 PM");
    assert.equal(formatManilaTime("2026-10-06T02:30:00Z", TZ), "10:30 AM");
  });
});

describe("calendar helpers", () => {
  it("selects the previous Manila calendar date", () => {
    // 2026-10-07 00:30 Manila = 2026-10-06 16:30 UTC → previous day Oct 6
    const now = new Date("2026-10-06T16:30:00Z");
    assert.equal(manilaDateString(now, TZ), "2026-10-07");
    assert.equal(previousDateString("2026-10-07"), "2026-10-06");
    assert.equal(addDays("2026-10-06", -2), "2026-10-04");
    assert.equal(addDays("2026-10-01", -1), "2026-09-30"); // month boundary
  });
  it("msUntilNextMidnight stays within one day", () => {
    const wait = msUntilNextMidnight(new Date("2026-10-06T16:30:00Z"), TZ);
    assert.ok(wait > 0 && wait <= 24 * 3600 * 1000);
  });
});

describe("report content", () => {
  const multi: ReportUserInput[] = [
    {
      displayName: "deah",
      sessions: [
        // deliberately out of order — builder must sort chronologically
        {
          clockIn: "2026-10-06T08:10:00Z", // 4:10 PM WORKING
          clockOut: "2026-10-06T11:20:00Z",
          durationSeconds: 11400,
          status: "COMPLETED",
        },
        {
          clockIn: "2026-10-06T05:03:00Z", // 1:03 PM WORKING
          clockOut: "2026-10-06T07:15:00Z",
          durationSeconds: 7920,
          status: "COMPLETED",
        },
      ],
    },
    {
      displayName: "ku",
      sessions: [
        {
          clockIn: "2026-10-06T02:30:00Z", // 10:30 AM CHILLING
          clockOut: "2026-10-06T03:45:00Z",
          durationSeconds: 4500,
          status: "COMPLETED",
        },
      ],
    },
    {
      displayName: "Windley",
      sessions: [
        {
          clockIn: "2026-10-06T12:45:00Z", // 8:45 PM, still ACTIVE
          clockOut: null,
          durationSeconds: null,
          status: "ACTIVE",
        },
      ],
    },
  ];

  it("groups each person's sessions into one chronological table with totals", () => {
    const messages = buildDailyReportMessages("2026-10-06", multi, TZ);
    assert.equal(messages.length, 1);
    const body = messages[0];
    assert.ok(body.includes("**October 6, 2026**"));
    assert.ok(body.includes("```text"));
    assert.ok(body.includes("Clock in"));
    assert.ok(body.includes("Clock out"));
    assert.ok(body.includes("Asia/Manila"));
    assert.equal(body.match(/\*\*deah\*\*/g)?.length, 1);
    assert.ok(body.indexOf("13:03:00") < body.indexOf("16:10:00"));
    assert.ok(body.includes("5h 22m 00s"));
    assert.match(body, /20:45:00\s+\| --\s+\| 3h 15m 00s\s+\| Working\s+\| Active/);
    assert.ok(body.includes("Total members tracked: `3`"));
    assert.ok(body.includes("Working sessions: `2`"));
    assert.ok(body.includes("Chilling sessions: `1`"));
    assert.ok(body.includes("Still active: `1`"));
  });

  it("generates a no-attendance report instead of skipping", () => {
    const messages = buildDailyReportMessages("2026-10-06", [], TZ);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].includes("No members were present in the Work Voice Channel"));
    assert.ok(messages[0].includes("Total members tracked: `0`"));
    assert.ok(messages[0].includes("• Working total: `0h 00m 00s`"));
    assert.ok(messages[0].includes("• Chilling total: `0h 00m 00s`"));
    assert.ok(messages[0].includes("• Total elapsed: `0h 00m 00s`"));
  });

  it("splits long reports into labeled parts without dropping records", () => {
    const many: ReportUserInput[] = [];
    for (let i = 0; i < 40; i++) {
      many.push({
        displayName: `member-${i}`,
        sessions: [
          {
            clockIn: `2026-10-06T0${5 + (i % 4)}:00:00Z`,
            clockOut: "2026-10-06T10:00:00Z",
            durationSeconds: 7200,
            status: "COMPLETED",
          },
        ],
      });
    }
    const messages = buildDailyReportMessages("2026-10-06", many, TZ);
    assert.ok(messages.length > 1);
    messages.forEach((m, i) => {
      assert.ok(m.length <= DISCORD_MESSAGE_LIMIT, `part ${i + 1} too long`);
      assert.ok(m.includes(`Part ${i + 1}/${messages.length}`));
      assert.equal((m.match(/```/g) ?? []).length % 2, 0, "unclosed code fence");
      for (const table of m.matchAll(/```text\n([\s\S]*?)```/g)) {
        assert.ok(table[1].startsWith("#"));
        assert.ok(table[1].includes("Clock in"));
      }
    });
    const joined = messages.join("\n");
    for (let i = 0; i < 40; i++) {
      assert.ok(joined.includes(`member-${i}`), `lost member-${i}`);
    }
  });

  it("corrects the Oct 9 carryover mismatch without inflating it to a full overnight duration", () => {
    const body = buildDailyReportMessages("2026-10-09", [{ displayName: "deah", sessions: [{
      clockIn: "2026-10-08T05:23:00Z", // Oct 8 1:23 PM
      clockOut: "2026-10-08T18:55:00Z", // Oct 9 2:55 AM
      durationSeconds: 10500, status: "COMPLETED",
    }] }], TZ).join("\n");
    assert.match(body, /00:00:00\*\s+\| 02:55:00\s+\| 2h 55m 00s/);
    assert.ok(!body.includes("13:23:00"));
  });

  it("clips clock-out at next midnight and calculates duration from timestamps", () => {
    const body = buildDailyReportMessages("2026-10-09", [{ displayName: "Amailah", sessions: [{
      clockIn: "2026-10-09T15:05:00Z", clockOut: "2026-10-09T16:01:00Z",
      durationSeconds: 60, status: "COMPLETED",
    }] }], TZ).join("\n");
    assert.match(body, /23:05:00\s+\| 24:00:00\*\s+\| 0h 55m 00s\s+\| Chilling\s+\| Continues/);
  });

  it("includes active carryover only within the date and never invents a clock-out", () => {
    const body = buildDailyReportMessages("2026-10-09", [{ displayName: "overnight", sessions: [{
      clockIn: "2026-10-08T15:00:00Z", clockOut: null, durationSeconds: null, status: "ACTIVE",
    }] }], TZ, new Date("2026-10-09T17:00:00Z")).join("\n");
    assert.match(body, /00:00:00\*\s+\| --\s+\| 24h 00m 00s/);
  });

  it("caps a current-day active duration at generation time", () => {
    const body = buildDailyReportMessages("2026-10-09", [{ displayName: "live", sessions: [{
      clockIn: "2026-10-09T05:00:00Z", clockOut: null, durationSeconds: null, status: "ACTIVE",
    }] }], TZ, new Date("2026-10-09T05:02:30Z")).join("\n");
    assert.ok(body.includes("0h 02m 30s"));
  });

  it("separates each person's Working and Chilling elapsed time and aggregates both in the summary", () => {
    const body = buildDailyReportMessages("2026-10-09", [
      { displayName: "mixed", sessions: [
        { clockIn: "2026-10-09T04:00:00Z", clockOut: "2026-10-09T04:45:00Z", durationSeconds: 2700, status: "COMPLETED" },
        { clockIn: "2026-10-09T05:00:00Z", clockOut: "2026-10-09T06:00:00Z", durationSeconds: 3600, status: "COMPLETED" },
        { clockIn: "2026-10-09T07:00:00Z", clockOut: null, durationSeconds: null, status: "ACTIVE" },
      ] },
      { displayName: "chilling-only", sessions: [
        { clockIn: "2026-10-09T03:00:00Z", clockOut: "2026-10-09T03:10:00Z", durationSeconds: 600, status: "COMPLETED" },
      ] },
    ], TZ, new Date("2026-10-09T07:30:00Z")).join("\n");
    const mixed = body.split("**mixed**")[1].split("**Summary**")[0];
    assert.ok(mixed.includes("Working total: `1h 30m 00s`"));
    assert.ok(mixed.includes("Chilling total: `0h 45m 00s`"));
    assert.ok(mixed.includes("Total on this date: `2h 15m 00s` (includes elapsed active time)"));
    const chillingOnly = body.split("**chilling-only**")[1].split("**mixed**")[0];
    assert.ok(chillingOnly.includes("Working total: `0h 00m 00s`"));
    assert.ok(chillingOnly.includes("Chilling total: `0h 10m 00s`"));
    const summary = body.split("**Summary**")[1];
    assert.ok(summary.includes("• Working total: `1h 30m 00s`"));
    assert.ok(summary.includes("• Chilling total: `0h 55m 00s`"));
    assert.ok(summary.includes("• Total elapsed: `2h 25m 00s`"));
  });

  it("uses clipped carryover durations once for category totals, excluding missing and cancelled time", () => {
    const carryover = { clockIn: "2026-10-08T05:23:00Z", clockOut: "2026-10-08T18:55:00Z", durationSeconds: 10500, status: "COMPLETED" };
    const body = buildDailyReportMessages("2026-10-09", [{ displayName: "overnight", sessions: [
      carryover, { ...carryover },
      { clockIn: "2026-10-09T02:00:00Z", clockOut: "2026-10-09T03:00:00Z", durationSeconds: 3600, status: "CANCELLED" },
      { clockIn: "2026-10-09T05:00:00Z", clockOut: null, durationSeconds: 3600, status: "COMPLETED" },
      { clockIn: "2026-10-09T15:00:00Z", clockOut: null, durationSeconds: null, status: "ACTIVE" },
    ] }], TZ, new Date("2026-10-09T17:00:00Z")).join("\n");
    assert.ok(body.includes("Working total: `2h 55m 00s`"));
    assert.ok(body.includes("Chilling total: `1h 00m 00s`"));
    assert.ok(body.includes("Total on this date: `3h 55m 00s`"));
    const summary = body.split("**Summary**")[1];
    assert.ok(summary.includes("• Working total: `2h 55m 00s`"));
    assert.ok(summary.includes("• Chilling total: `1h 00m 00s`"));
    assert.ok(summary.includes("• Total elapsed: `3h 55m 00s`"));
  });

  it("does not double count duplicate legacy split rows, or include rows outside the day", () => {
    const session = { clockIn: "2026-10-08T15:00:00Z", clockOut: "2026-10-08T17:00:00Z",
      durationSeconds: 3600, status: "COMPLETED" };
    const body = buildDailyReportMessages("2026-10-09", [{ displayName: "legacy", sessions: [
      session, { ...session, durationSeconds: 7200 },
      { ...session, clockIn: "2026-10-09T16:00:00Z", clockOut: "2026-10-09T17:00:00Z" },
      { ...session, clockIn: "2026-10-08T14:00:00Z", clockOut: "2026-10-08T16:00:00Z" },
    ] }], TZ).join("\n");
    assert.ok(body.includes("Total on this date: `1h 00m 00s`"));
    assert.ok(body.includes("Chilling sessions: `1`"));
  });

  it("shows sub-minute time, and marks missing clock-outs for review", () => {
    const body = buildDailyReportMessages("2026-10-09", [{ displayName: "short", sessions: [
      { clockIn: "2026-10-09T04:50:20Z", clockOut: "2026-10-09T04:50:45Z", durationSeconds: 0, status: "COMPLETED" },
      { clockIn: "2026-10-09T05:00:00Z", clockOut: null, durationSeconds: 100, status: "COMPLETED" },
    ] }], TZ).join("\n");
    assert.ok(body.includes("0h 00m 25s"));
    assert.ok(body.includes("Missing"));
    assert.ok(body.includes("Check log"));
    assert.ok(body.includes("Total on this date: `0h 00m 25s`"));
  });

  it("preserves fractional timestamps so rounding is visible for short sessions", () => {
    const body = buildDailyReportMessages("2026-10-09", [{ displayName: "Yami", sessions: [{
      clockIn: "2026-10-09T04:50:40.261Z", clockOut: "2026-10-09T04:51:01.216Z",
      durationSeconds: 20, status: "COMPLETED",
    }] }], TZ).join("\n");
    assert.match(body, /12:50:40\.261\s+\| 12:51:01\.216\s+\| 0h 00m 20s/);
    assert.ok(body.includes("Report cutoff: October 10, 2026, 00:00:00"));
  });

  it("paginates a single person's many sessions with headers and all rows intact", () => {
    const sessions = Array.from({ length: 100 }, (_, i) => ({
      clockIn: new Date(Date.parse("2026-10-09T05:00:00Z") + i * 60000).toISOString(),
      clockOut: new Date(Date.parse("2026-10-09T05:00:30Z") + i * 60000).toISOString(),
      durationSeconds: 30, status: "COMPLETED",
    }));
    const messages = buildDailyReportMessages("2026-10-09", [{ displayName: "many", sessions }], TZ);
    assert.ok(messages.length > 1);
    for (const m of messages) {
      assert.ok(m.length <= DISCORD_MESSAGE_LIMIT);
      assert.equal((m.match(/```/g) ?? []).length % 2, 0);
    }
    const joined = messages.join("\n");
    for (let i = 1; i <= 100; i++) assert.match(joined, new RegExp(`\\n${i} +\\|`));
    assert.ok(joined.includes("Total on this date: `0h 50m 00s`"));
    assert.equal((joined.match(/^Working total: `0h 50m 00s`$/gm) ?? []).length, 1);
    assert.equal((joined.match(/^Chilling total: `0h 00m 00s`$/gm) ?? []).length, 1);
  });
});

describe("calendar day bounds", () => {
  it("uses Manila midnight and supports DST day lengths", () => {
    const bounds = dayBoundsUtc("2026-10-09", TZ);
    assert.equal(bounds.startUtc.toISOString(), "2026-10-08T16:00:00.000Z");
    assert.equal(bounds.endUtc.toISOString(), "2026-10-09T16:00:00.000Z");
    const spring = dayBoundsUtc("2026-03-08", "America/New_York");
    const fall = dayBoundsUtc("2026-11-01", "America/New_York");
    assert.equal(+spring.endUtc - +spring.startUtc, 23 * 3600000);
    assert.equal(+fall.endUtc - +fall.startUtc, 25 * 3600000);
  });
});

describe("retention policy", () => {
  it("keeps today + 2 previous days, deletes older non-ACTIVE", () => {
    const cutoff = retentionCutoff("2026-10-06");
    assert.equal(cutoff, "2026-10-04");
    assert.equal(isEligibleForDeletion("2026-10-03", cutoff, "COMPLETED"), true);
    assert.equal(isEligibleForDeletion("2026-10-04", cutoff, "COMPLETED"), false);
    assert.equal(isEligibleForDeletion("2026-10-05", cutoff, "COMPLETED"), false);
    assert.equal(isEligibleForDeletion("2026-10-06", cutoff, "COMPLETED"), false);
  });
  it("never deletes ACTIVE sessions, even past the cutoff", () => {
    const cutoff = retentionCutoff("2026-10-06");
    assert.equal(isEligibleForDeletion("2026-10-01", cutoff, "ACTIVE"), false);
  });
});
