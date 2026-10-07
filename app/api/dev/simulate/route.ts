import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { clockIn } from "@/lib/attendance/clock-in";
import { clockOut } from "@/lib/attendance/clock-out";
import { reconcile } from "@/lib/attendance/reconcile";

export const dynamic = "force-dynamic";

const SCENARIOS = ["JOIN", "LEAVE", "DUP_JOIN", "DUP_LEAVE", "MOVE_IN", "MOVE_OUT", "RECONCILE"] as const;

const bodySchema = z.object({
  scenario: z.enum(SCENARIOS),
  discord_user_id: z.string().min(1).max(64).optional(),
  guild_id: z.string().min(1).max(64).optional(),
  channel_id: z.string().min(1).max(64).optional(),
  members: z.array(z.string().min(1).max(64)).max(1000).optional(),
});

function fakeEventId() {
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ scenarios: SCENARIOS });
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const input = parsed.data;
    const guildId = input.guild_id ?? process.env.DISCORD_GUILD_ID ?? "dev-guild";
    const channelId = input.channel_id ?? process.env.DISCORD_WORK_CHANNEL_ID ?? "dev-channel";
    const now = new Date();
    const db = createSupabaseServiceClient();

    if (input.scenario !== "RECONCILE" && !input.discord_user_id) {
      return NextResponse.json({ error: "discord_user_id is required for this scenario" }, { status: 400 });
    }

    const discordUserId = input.discord_user_id ?? "";

    switch (input.scenario) {
      case "JOIN":
      case "MOVE_IN": {
        const event_id = fakeEventId();
        const res = await clockIn(db, { discordUserId, guildId, channelId, now });
        if (!res.ok) return NextResponse.json({ ok: true, ignored: true, reason: res.reason, event_id });
        return NextResponse.json({ event_id, result: res });
      }
      case "LEAVE":
      case "MOVE_OUT": {
        const event_id = fakeEventId();
        const res = await clockOut(db, { discordUserId, now });
        if (!res.ok) return NextResponse.json({ ok: true, ignored: true, reason: res.reason, event_id });
        return NextResponse.json({ event_id, result: res });
      }
      case "DUP_JOIN": {
        const first_id = fakeEventId();
        const first = await clockIn(db, { discordUserId, guildId, channelId, now });
        const second_id = fakeEventId();
        const second = await clockIn(db, { discordUserId, guildId, channelId, now });
        return NextResponse.json({ ok: true, first_id, first, second_id, second });
      }
      case "DUP_LEAVE": {
        const first_id = fakeEventId();
        const first = await clockOut(db, { discordUserId, now });
        const second_id = fakeEventId();
        const second = await clockOut(db, { discordUserId, now });
        return NextResponse.json({ ok: true, first_id, first, second_id, second });
      }
      case "RECONCILE": {
        const event_id = fakeEventId();
        const memberDiscordIds = input.members ?? (input.discord_user_id ? [input.discord_user_id] : []);
        const res = await reconcile(db, { guildId, channelId, memberDiscordIds, now });
        return NextResponse.json({ ok: true, event_id, ...res });
      }
    }
  } catch (err) {
    console.error("dev/simulate error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
