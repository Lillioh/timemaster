import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "discord.js";
import { fetchSessionsForDate, resolveHumans, type SessionRow } from "./sessions.js";

describe("report source", () => {
  it("queries overlapping Manila intervals, includes ACTIVE carryover, and reads every page", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const source = Array.from({ length: 1001 }, (_, i) => ({
      id: String(i), clock_in: "2026-10-08T15:00:00Z", clock_out: null,
      duration_seconds: null, status: "ACTIVE", attendance_date: "2026-10-08", discord_user_id: String(i),
      users: i % 2 ? { display_name: "Human", discord_username: null } : [{ display_name: "Human", discord_username: null }],
    }));
    const chain = {
      select: () => chain,
      lt: (...args: unknown[]) => { calls.push(["lt", ...args]); return chain; },
      or: (...args: unknown[]) => { calls.push(["or", ...args]); return chain; },
      order: () => chain,
      range: (start: number, end: number) => {
        calls.push(["range", start, end]);
        return Promise.resolve({ data: source.slice(start, end + 1), error: null });
      },
    };
    const db = { from: () => chain } as unknown as SupabaseClient;
    const rows = await fetchSessionsForDate(db, "2026-10-09", "Asia/Manila");
    assert.equal(rows.length, 1001);
    assert.deepEqual(rows[0].users, rows[1].users);
    assert.deepEqual(calls[0], ["lt", "clock_in", "2026-10-09T16:00:00.000Z"]);
    assert.deepEqual(calls[1], ["or", "clock_out.gt.2026-10-08T16:00:00.000Z,and(status.eq.ACTIVE,clock_out.is.null),attendance_date.eq.2026-10-09"]);
    assert.deepEqual(calls.filter(([method]) => method === "range"), [["range", 0, 999], ["range", 1000, 1999]]);
  });

  it("excludes bots and groups every human's sessions under their profile name", async () => {
    const row: SessionRow = { id: "1", clock_in: "2026-10-09T05:00:00Z", clock_out: null,
      duration_seconds: null, status: "ACTIVE", attendance_date: "2026-10-09", discord_user_id: "human",
      users: { display_name: "Display name", discord_username: "username" } };
    const client = { users: { fetch: async (id: string) => ({ bot: id === "bot" }) } } as unknown as Client;
    const users = await resolveHumans(client, [row, { ...row, id: "2" }, { ...row, discord_user_id: "bot" }]);
    assert.equal(users.length, 1);
    assert.equal(users[0].displayName, "Display name");
    assert.equal(users[0].sessions.length, 2);
  });
});
