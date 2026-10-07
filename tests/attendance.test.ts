import { describe, expect, it } from "vitest";
import {
  calculateDurationSeconds,
  dailyStatusFor,
  splitDurationByDate,
} from "@/lib/attendance/calculate-duration";
import { formatHm } from "@/lib/utils/format";

describe("calculateDurationSeconds", () => {
  it("computes whole-second duration", () => {
    const a = new Date("2026-01-01T00:00:00.000Z");
    const b = new Date("2026-01-01T01:30:45.250Z");
    expect(calculateDurationSeconds(a, b)).toBe(1 * 3600 + 30 * 60 + 45);
  });

  it("never returns negative (clock skew / reversed args clamp to 0)", () => {
    const a = new Date("2026-01-01T02:00:00.000Z");
    const b = new Date("2026-01-01T01:00:00.000Z");
    expect(calculateDurationSeconds(a, b)).toBe(0);
    expect(calculateDurationSeconds(a, a)).toBe(0);
  });

  it("floors sub-second durations", () => {
    const a = new Date("2026-01-01T00:00:00.000Z");
    const b = new Date("2026-01-01T00:00:01.999Z");
    expect(calculateDurationSeconds(a, b)).toBe(1);
  });
});

describe("splitDurationByDate", () => {
  it("splits a midnight-crossing session into two entries (3600 + 3600) in UTC", () => {
    const clockIn = new Date("2026-01-01T23:00:00.000Z");
    const clockOut = new Date("2026-01-02T01:00:00.000Z");
    const split = splitDurationByDate(clockIn, clockOut, "UTC");
    expect(split.size).toBe(2);
    expect(split.get("2026-01-01")).toBe(3600);
    expect(split.get("2026-01-02")).toBe(3600);
  });

  it("returns a single entry for a same-day session", () => {
    const clockIn = new Date("2026-01-01T09:00:00.000Z");
    const clockOut = new Date("2026-01-01T12:30:00.000Z");
    const split = splitDurationByDate(clockIn, clockOut, "UTC");
    expect(split.size).toBe(1);
    expect(split.get("2026-01-01")).toBe(3 * 3600 + 30 * 60);
  });

  it("returns empty map when clockOut <= clockIn", () => {
    const a = new Date("2026-01-01T10:00:00.000Z");
    expect(splitDurationByDate(a, a, "UTC").size).toBe(0);
    expect(
      splitDurationByDate(a, new Date("2026-01-01T09:00:00.000Z"), "UTC").size,
    ).toBe(0);
  });
});

describe("dailyStatusFor", () => {
  const REQUIRED = 28_800; // 8h
  it("28800s meets the 8h requirement -> COMPLETE", () => {
    expect(dailyStatusFor(28_800, REQUIRED)).toBe("COMPLETE");
  });
  it("27000s is short of 8h -> INCOMPLETE", () => {
    expect(dailyStatusFor(27_000, REQUIRED)).toBe("INCOMPLETE");
  });
  it("30000s exceeds 8h -> COMPLETE", () => {
    expect(dailyStatusFor(30_000, REQUIRED)).toBe("COMPLETE");
  });
});

describe("formatHm", () => {
  it("formats hours and zero-padded minutes", () => {
    expect(formatHm(0)).toBe("0h 00m");
    expect(formatHm(90)).toBe("0h 01m");
    expect(formatHm(28_800)).toBe("8h 00m");
    expect(formatHm(30_000)).toBe("8h 20m");
  });
  it("clamps negatives to zero", () => {
    expect(formatHm(-5)).toBe("0h 00m");
  });
});
