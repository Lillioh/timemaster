import { describe, expect, it } from "vitest";
import { webhookPayloadSchema } from "@/lib/validation/discord-event";

const base = {
  event_id: "evt-123",
  guild_id: "guild-1",
  channel_id: "channel-1",
  timestamp: "2026-01-01T00:00:00.000Z",
};

describe("webhookPayloadSchema", () => {
  it("valid VOICE_JOIN passes", () => {
    const res = webhookPayloadSchema.safeParse({
      ...base,
      event: "VOICE_JOIN",
      discord_user_id: "user-1",
    });
    expect(res.success).toBe(true);
  });

  it("invalid event is rejected", () => {
    const res = webhookPayloadSchema.safeParse({
      ...base,
      event: "NOT_A_REAL_EVENT",
      discord_user_id: "user-1",
    });
    expect(res.success).toBe(false);
  });

  it("RECONCILE with members passes", () => {
    const res = webhookPayloadSchema.safeParse({
      ...base,
      event: "RECONCILE",
      members: [{ discord_user_id: "user-1" }, { discord_user_id: "user-2" }],
    });
    expect(res.success).toBe(true);
  });

  it("missing event_id fails", () => {
    const { event_id: _omit, ...noId } = base;
    void _omit;
    const res = webhookPayloadSchema.safeParse({
      ...noId,
      event: "VOICE_JOIN",
      discord_user_id: "user-1",
    });
    expect(res.success).toBe(false);
  });
});
