import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "@/lib/discord/signature";

const SECRET = "test-secret-min-32-chars-0123456789";
const BODY = JSON.stringify({
  event_id: "evt-1",
  event: "VOICE_JOIN",
  guild_id: "g1",
  channel_id: "c1",
  discord_user_id: "u1",
  timestamp: "2026-01-01T00:00:00.000Z",
});

describe("discord webhook signature", () => {
  it("sign then verify returns true", () => {
    const sig = signPayload(BODY, SECRET);
    expect(verifySignature(BODY, sig, SECRET)).toBe(true);
  });

  it("wrong secret returns false", () => {
    const sig = signPayload(BODY, SECRET);
    expect(verifySignature(BODY, sig, "wrong-secret")).toBe(false);
  });

  it("tampered body returns false", () => {
    const sig = signPayload(BODY, SECRET);
    const tampered = BODY.replace("evt-1", "evt-2");
    expect(verifySignature(tampered, sig, SECRET)).toBe(false);
  });

  it("missing signature returns false", () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false);
    expect(verifySignature(BODY, "", SECRET)).toBe(false);
  });
});
