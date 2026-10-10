import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clockOut } from "@/lib/attendance/clock-out";

type Row = Record<string, unknown>;

/** In-memory rows let us verify the actual writes and daily aggregation. */
function sessionDb(clockIn: string, insertError: Error | null = null) {
  const sessions: Row[] = [{
    id: "session-1", user_id: "user-1", discord_user_id: "discord-1", guild_id: "guild-1",
    voice_channel_id: "voice-1", voice_channel_name: "Work", status: "ACTIVE",
    clock_in: clockIn, clock_out: null, duration_seconds: null, attendance_date: "2026-10-08",
  }];
  const totals: Row[] = [];
  const db = { from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let mutation: "update" | "insert" | null = null;
    let values: Row = {};
    const source = () => table === "attendance_sessions" ? sessions :
      table === "users" ? [{ id: "user-1", active: true, discord_user_id: "discord-1" }] :
        [{ active: true, required_daily_seconds: 28800 }];
    const selected = () => source().filter((r) => filters.every(([k, v]) => r[k] === v));
    const execute = () => {
      if (mutation === "insert") {
        if (insertError) return { data: null, error: insertError };
        sessions.push({ id: `session-${sessions.length + 1}`, ...values });
      }
      if (mutation === "update") selected().forEach((r) => Object.assign(r, values));
      return { data: selected(), error: null };
    };
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      order: () => chain, limit: () => chain,
      update: (row: Row) => { mutation = "update"; values = row; return chain; },
      insert: (row: Row) => { mutation = "insert"; values = row; return chain; },
      upsert: (row: Row) => { totals.push(row); return Promise.resolve({ error: null }); },
      maybeSingle: () => Promise.resolve({ data: selected()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: selected()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return chain;
  } } as unknown as SupabaseClient;
  return { db, sessions, totals };
}

afterEach(() => vi.unstubAllEnvs());

describe("overnight clock-out persistence", () => {
  it("writes midnight boundaries so each row's timestamps match its daily duration", async () => {
    vi.stubEnv("APP_TIMEZONE", "Asia/Manila");
    const { db, sessions, totals } = sessionDb("2026-10-08T05:23:00Z");
    const result = await clockOut(db, { discordUserId: "discord-1", now: new Date("2026-10-08T18:55:00Z") });
    expect(result.closed).toBe(true);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      clock_in: "2026-10-08T05:23:00Z", clock_out: "2026-10-08T16:00:00.000Z",
      duration_seconds: 38220, attendance_date: "2026-10-08", status: "COMPLETED",
    });
    expect(sessions[1]).toMatchObject({
      clock_in: "2026-10-08T16:00:00.000Z", clock_out: "2026-10-08T18:55:00.000Z",
      duration_seconds: 10500, attendance_date: "2026-10-09", status: "COMPLETED",
      guild_id: "guild-1", voice_channel_id: "voice-1",
    });
    expect(totals.map((r) => r.total_seconds)).toEqual([38220, 10500]);
    for (const s of sessions) {
      expect((Date.parse(String(s.clock_out)) - Date.parse(String(s.clock_in))) / 1000).toBe(s.duration_seconds);
    }
  });

  it("uses separate boundaries for every date of a multi-day session", async () => {
    vi.stubEnv("APP_TIMEZONE", "Asia/Manila");
    const { db, sessions } = sessionDb("2026-10-08T15:00:00Z");
    await clockOut(db, { discordUserId: "discord-1", now: new Date("2026-10-10T17:00:00Z") });
    expect(sessions.map((s) => s.duration_seconds)).toEqual([3600, 86400, 86400, 3600]);
    for (const s of sessions) {
      expect((Date.parse(String(s.clock_out)) - Date.parse(String(s.clock_in))) / 1000).toBe(s.duration_seconds);
    }
  });

  it("keeps same-day sessions intact", async () => {
    vi.stubEnv("APP_TIMEZONE", "Asia/Manila");
    const { db, sessions } = sessionDb("2026-10-08T05:23:00Z");
    await clockOut(db, { discordUserId: "discord-1", now: new Date("2026-10-08T06:23:00Z") });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ clock_out: "2026-10-08T06:23:00.000Z", duration_seconds: 3600 });
  });

  it("surfaces a failed continuation insert instead of reporting success", async () => {
    vi.stubEnv("APP_TIMEZONE", "Asia/Manila");
    const { db } = sessionDb("2026-10-08T15:00:00Z", new Error("insert failed"));
    await expect(clockOut(db, { discordUserId: "discord-1", now: new Date("2026-10-08T17:00:00Z") }))
      .rejects.toThrow("insert failed");
  });
});
