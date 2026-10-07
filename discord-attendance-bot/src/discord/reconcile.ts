import type { Guild } from "discord.js";

export interface ReconcileMember {
  discord_user_id: string;
}

export interface ReconcilePayload {
  event: "RECONCILE";
  event_id: string;
  guild_id: string;
  channel_id: string;
  members: ReconcileMember[];
  timestamp: string;
}

/**
 * Fetch the current (non-bot) member ids in the work voice channel.
 * Returns [] if the channel is missing / not voice-based.
 */
export async function getWorkChannelMemberIds(
  guild: Guild,
  workChannelId: string,
): Promise<string[]> {
  const channel = await guild.channels.fetch(workChannelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) return [];
  // `members` is a Collection<GuildMember> for voice channels.
  return channel.members
    .filter((m) => !m.user.bot)
    .map((m) => m.id);
}

interface BuildReconcileArgs {
  eventId: string;
  guildId: string;
  channelId: string;
  memberIds: string[];
  timestamp?: string;
}

export function buildReconcilePayload(args: BuildReconcileArgs): ReconcilePayload {
  return {
    event: "RECONCILE",
    event_id: args.eventId,
    guild_id: args.guildId,
    channel_id: args.channelId,
    members: args.memberIds.map((id) => ({ discord_user_id: id })),
    timestamp: args.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Convenience: fetch live members + build the RECONCILE payload in one step.
 */
export async function buildReconcilePayloadFromGuild(
  guild: Guild,
  workChannelId: string,
  eventId: string,
): Promise<ReconcilePayload> {
  const memberIds = await getWorkChannelMemberIds(guild, workChannelId);
  return buildReconcilePayload({
    eventId,
    guildId: guild.id,
    channelId: workChannelId,
    memberIds,
  });
}
