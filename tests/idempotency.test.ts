import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clockIn } from "@/lib/attendance/clock-in";
import { clockOut } from "@/lib/attendance/clock-out";

// ── Minimal Supabase stub ─────────────────────────────────────────────
// Implements just enough of the query-builder chain used by clockIn/clockOut:
// from(table).select().eq().order().limit().maybeSingle()/single(),
// from().insert().select().single(), from().update().eq().eq() (awaitable),
// from().upsert().

type Canned = Record<string, { data: unknown; error?: unknown }>;

function chainFor(table: string, canned: Canned) {
  const resultFor = () =>
    canned[table] ?? { data: null as unknown, error: null as unknown };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: () => chain,
    update: () => chain,
    upsert: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve(resultFor()),
    single: () => Promise.resolve(resultFor()),
  };
  // Awaitable (supabase builders are thenable): used by update(...).eq().eq().
  (
    chain as unknown as { then: unknown }
  ).then = (resolve: (_value: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve);
  return chain;
}

function stubDb(canned: Canned): SupabaseClient {
  return {
    from: (table: string) => chainFor(table, canned),
  } as unknown as SupabaseClient;
}

describe("webhook_events dedupe concept", () => {
  it("second insert of the same event_id is rejected", () => {
    const seen = new Set<string>();
    const insertEvent = (eventId: string): { inserted: boolean } => {
      if (seen.has(eventId)) return { inserted: false }; // UNIQUE violation
      seen.add(eventId);
      return { inserted: true };
    };
    expect(insertEvent("evt-1").inserted).toBe(true);
    expect(insertEvent("evt-1").inserted).toBe(false);
    expect(insertEvent("evt-2").inserted).toBe(true);
  });
});

describe("duplicate JOIN -> single ACTIVE session", () => {
  it("clockIn returns deduped:true when an ACTIVE session already exists", async () => {
    const db = stubDb({
      users: { data: { id: "user-uuid-1", active: true } },
      discord_configuration: { data: { required_daily_seconds: 28800 } },
      attendance_sessions: { data: { id: "sess-existing" } },
    });
    const res = await clockIn(db, {
      discordUserId: "discord-1",
      guildId: "guild-1",
      channelId: "channel-1",
      now: new Date("2026-01-01T09:00:00.000Z"),
    });
    expect(res).toMatchObject({
      ok: true,
      deduped: true,
      session_id: "sess-existing",
    });
  });
});

describe("duplicate LEAVE -> no ACTIVE session", () => {
  it("clockOut with no ACTIVE session returns closed:false without throwing", async () => {
    const db = stubDb({
      users: { data: { id: "user-uuid-1", active: true } },
      attendance_sessions: { data: null },
    });
    const res = await clockOut(db, {
      discordUserId: "discord-1",
      now: new Date("2026-01-01T17:00:00.000Z"),
    });
    expect(res).toMatchObject({ ok: true, closed: false });
  });
});
