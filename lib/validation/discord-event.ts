import { z } from "zod";

const base = z.object({
  event_id: z.string().min(1).max(128),
  guild_id: z.string().min(1).max(64),
  channel_id: z.string().min(1).max(64),
  timestamp: z.string().datetime({ offset: true }),
});

export const voiceJoinSchema = base.extend({
  event: z.literal("VOICE_JOIN"),
  discord_user_id: z.string().min(1).max(64),
  channel_name: z.string().max(128).optional(),
});

export const voiceLeaveSchema = base.extend({
  event: z.literal("VOICE_LEAVE"),
  discord_user_id: z.string().min(1).max(64),
  channel_name: z.string().max(128).optional(),
});

export const voiceJoinLeaveSchema = z.union([voiceJoinSchema, voiceLeaveSchema]);

export const reconcileSchema = base.extend({
  event: z.literal("RECONCILE"),
  members: z
    .array(z.object({ discord_user_id: z.string().min(1).max(64) }))
    .max(1000),
});

export const webhookPayloadSchema = z.discriminatedUnion("event", [
  voiceJoinSchema,
  voiceLeaveSchema,
  reconcileSchema,
]);

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
