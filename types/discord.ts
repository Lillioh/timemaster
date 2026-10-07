export type VoiceEventType = "VOICE_JOIN" | "VOICE_LEAVE" | "RECONCILE";

export interface VoiceJoinLeavePayload {
  event: "VOICE_JOIN" | "VOICE_LEAVE";
  event_id: string;
  guild_id: string;
  discord_user_id: string;
  channel_id: string;
  channel_name?: string;
  timestamp: string; // ISO-8601, informational only
}

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

export type DiscordWebhookPayload =
  | VoiceJoinLeavePayload
  | ReconcilePayload;
