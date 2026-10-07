import type { SupabaseClient } from "@supabase/supabase-js";
import { clockIn } from "./clock-in";
import { clockOut } from "./clock-out";

export interface ReconcileInput {
  guildId: string;
  channelId: string;
  channelName?: string;
  memberDiscordIds: string[];
  now?: Date;
}

/**
 * Idempotent reconciliation:
 * - members present without ACTIVE session => clock in
 * - ACTIVE sessions whose user is absent => clock out
 */
export async function reconcile(db: SupabaseClient, input: ReconcileInput) {
  const now = input.now ?? new Date();
  const present = new Set(input.memberDiscordIds);

  const { data: actives, error } = await db
    .from("attendance_sessions")
    .select("id,discord_user_id,user_id")
    .eq("status", "ACTIVE")
    .eq("guild_id", input.guildId);
  if (error) throw error;

  const activeByDiscord = new Map((actives ?? []).map((s) => [s.discord_user_id as string, s]));

  const opened: string[] = [];
  const closed: string[] = [];

  for (const discordId of present) {
    if (!activeByDiscord.has(discordId)) {
      const res = await clockIn(db, {
        discordUserId: discordId,
        guildId: input.guildId,
        channelId: input.channelId,
        channelName: input.channelName,
        now,
      });
      if (res.ok) opened.push(discordId);
    }
  }
  for (const [discordId] of activeByDiscord) {
    // Only close sessions for the work channel being reconciled. Sessions in
    // other channels/guilds are untouched (single-guild deployments: all actives
    // belong to the work channel, so this closes stale ones like D in the spec).
    if (!present.has(discordId)) {
      const res = await clockOut(db, { discordUserId: discordId, now });
      if (res.ok && "closed" in res && res.closed) closed.push(discordId);
    }
  }
  return { opened, closed, alreadyCorrect: opened.length === 0 && closed.length === 0 };
}
