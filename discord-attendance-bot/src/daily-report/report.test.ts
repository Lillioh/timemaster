/**
 * Unit tests for the daily-report pure logic (no Discord / Supabase I/O).
 * Run: npm test  (tsx --test)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
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

  it("shows every session individually, sorted, with sections + summary", () => {
    const messages = buildDailyReportMessages("2026-10-06", multi, TZ);
    assert.equal(messages.length, 1);
    const body = messages[0];
    assert.ok(body.includes("**October 6, 2026**"));
    assert.ok(body.includes("**🟢 WORKING**"));
    assert.ok(body.includes("**🟡 CHILLING**"));
    assert.ok(body.includes("**🔵 STILL ACTIVE**"));
    // Both of deah's sessions appear, chronological (1:03 PM before 4:10 PM).
    assert.ok(body.includes("Session 1 — 🟢 `1:03 PM`"));
    assert.ok(body.includes("Session 2 — 🟢 `4:10 PM`"));
    assert.ok(body.indexOf("1:03 PM") < body.indexOf("4:10 PM"));
    // ACTIVE session displays Still active, never an invented clock-out.
    assert.ok(body.includes("`Still active`"));
    assert.ok(body.includes("Total members tracked: `3`"));
    assert.ok(body.includes("Working sessions: `2`"));
    assert.ok(body.includes("Chilling sessions: `1`"));
    assert.ok(body.includes("Still active: `1`"));
  });

  it("generates a no-attendance report instead of skipping", () => {
    const messages = buildDailyReportMessages("2026-10-06", [], TZ);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].includes("No members entered the Work Voice Channel"));
    assert.ok(messages[0].includes("Total members tracked: `0`"));
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
    });
    const joined = messages.join("\n");
    for (let i = 0; i < 40; i++) {
      assert.ok(joined.includes(`member-${i}`), `lost member-${i}`);
    }
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
