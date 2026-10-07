/**
 * Voice channel transition logic.
 *
 * Rules (workChannelId = the tracked "work" voice channel):
 *   NO (null)      -> WORK = JOIN
 *   OTHER          -> WORK = JOIN
 *   WORK           -> NO (null) = LEAVE
 *   WORK           -> OTHER = LEAVE
 *   OTHER          -> OTHER (different) = none
 *   WORK           -> WORK (same channel) = none
 *
 * Mute / deafen / streaming changes do not alter channelId, so they
 * always resolve to `null` (ignored) via the `old === new` check.
 */

export type Transition = "JOIN" | "LEAVE";

export function decideTransition(
  oldChannelId: string | null | undefined,
  newChannelId: string | null | undefined,
  workChannelId: string,
): Transition | null {
  const oldId = oldChannelId ?? null;
  const newId = newChannelId ?? null;

  // No channel change (including mute/deafen/streaming toggles) → ignore.
  if (oldId === newId) return null;

  // Entered the work channel from anywhere (including from null).
  if (newId === workChannelId) return "JOIN";

  // Left the work channel to anywhere (including to null).
  if (oldId === workChannelId) return "LEAVE";

  // Moved between two untracked channels, or joined/left an untracked
  // channel (NO -> OTHER, OTHER -> NO, OTHER -> OTHER). Ignore.
  return null;
}

// --- Payload helpers (shapes mirror types/discord.ts in the web app) ---

export interface VoiceJoinLeavePayload {
  event: "VOICE_JOIN" | "VOICE_LEAVE";
  event_id: string;
  guild_id: string;
  discord_user_id: string;
  channel_id: string;
  channel_name?: string;
  timestamp: string;
}

interface BuildJoinLeaveArgs {
  transition: Transition;
  eventId: string;
  guildId: string;
  discordUserId: string;
  channelId: string;
  channelName?: string;
  timestamp?: string;
}

export function buildJoinLeavePayload(args: BuildJoinLeaveArgs): VoiceJoinLeavePayload {
  return {
    event: args.transition === "JOIN" ? "VOICE_JOIN" : "VOICE_LEAVE",
    event_id: args.eventId,
    guild_id: args.guildId,
    discord_user_id: args.discordUserId,
    channel_id: args.channelId,
    ...(args.channelName ? { channel_name: args.channelName } : {}),
    timestamp: args.timestamp ?? new Date().toISOString(),
  };
}
