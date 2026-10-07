import { describe, expect, it } from "vitest";

/**
 * Mirror of the bot's voice-state transition decision.
 * The bot only emits events for the configured work channel:
 * - entering the work channel from anywhere else (incl. null) => JOIN
 * - leaving the work channel to anywhere else (incl. null)   => LEAVE
 * - anything else (other<->other, work<->work)               => null (ignore)
 */
function decide(
  oldChannelId: string | null,
  newChannelId: string | null,
  workChannelId: string,
): "JOIN" | "LEAVE" | null {
  if (oldChannelId !== workChannelId && newChannelId === workChannelId)
    return "JOIN";
  if (oldChannelId === workChannelId && newChannelId !== workChannelId)
    return "LEAVE";
  return null;
}

const WORK = "work-channel";
const OTHER = "other-channel";

describe("voice-state transition decision", () => {
  it("null -> work = JOIN", () => {
    expect(decide(null, WORK, WORK)).toBe("JOIN");
  });
  it("other -> work = JOIN", () => {
    expect(decide(OTHER, WORK, WORK)).toBe("JOIN");
  });
  it("work -> null = LEAVE", () => {
    expect(decide(WORK, null, WORK)).toBe("LEAVE");
  });
  it("work -> other = LEAVE", () => {
    expect(decide(WORK, OTHER, WORK)).toBe("LEAVE");
  });
  it("other -> other = null (ignored)", () => {
    expect(decide(OTHER, "another-channel", WORK)).toBe(null);
  });
  it("work -> work = null (ignored, e.g. mute/unmute)", () => {
    expect(decide(WORK, WORK, WORK)).toBe(null);
  });
});
