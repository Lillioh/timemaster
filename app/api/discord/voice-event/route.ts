import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/discord/signature";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { webhookPayloadSchema } from "@/lib/validation/discord-event";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { clockIn } from "@/lib/attendance/clock-in";
import { clockOut } from "@/lib/attendance/clock-out";
import { reconcile } from "@/lib/attendance/reconcile";
import { writeLog } from "@/lib/utils/logs";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function markProcessed(db: SupabaseClient, eventId: string) {
  try {
    await db.from("webhook_events").update({ processed: true }).eq("event_id", eventId);
  } catch {
    // Idempotency bookkeeping must never break the response.
  }
}

export async function POST(req: NextRequest) {
  let db: SupabaseClient | null = null;
  try {
    // 1. Raw body (needed for HMAC verification).
    const raw = await req.text();

    // 2. Signature check.
    const secret = process.env.DISCORD_WEBHOOK_SECRET;
    if (!secret) {
      console.error("voice-event: DISCORD_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
    const sig = req.headers.get("x-discord-signature");
    if (!sig || !verifySignature(raw, sig, secret)) {
      console.warn("voice-event: invalid signature rejected");
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    // 3. Rate limit: 120 req/min per IP.
    const ip = clientIp(req.headers);
    const rl = rateLimit(`voice-event:${ip}`, 120, 60_000);
    if (!rl.allowed) {
      console.warn(`voice-event: rate limit exceeded for ${ip}`);
      return NextResponse.json({ error: "rate limited" }, { status: 429 });
    }

    // 4. Parse JSON.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    // 5. Validate payload.
    const result = webhookPayloadSchema.safeParse(parsed);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".") || "payload"}: ${i.message}`)
        .join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const payload = result.data;

    db = createSupabaseServiceClient();

    // 6. Idempotency ledger insert.
    const discordUserId =
      payload.event === "RECONCILE" ? null : payload.discord_user_id;
    const { error: ledgerError } = await db.from("webhook_events").insert({
      event_id: payload.event_id,
      event_type: payload.event,
      discord_user_id: discordUserId,
      guild_id: payload.guild_id,
      channel_id: payload.channel_id,
      payload: parsed,
      processed: false,
    });
    if (ledgerError) {
      if ((ledgerError as { code?: string }).code === "23505") {
        await writeLog(db, "info", "duplicate event rejected", "Duplicate webhook event ignored", {
          event_id: payload.event_id,
        });
        return NextResponse.json({ ok: true, deduped: true });
      }
      throw ledgerError;
    }

    // 7. Guild validation: active config wins, env is fallback.
    const { data: cfg } = await db
      .from("discord_configuration")
      .select("guild_id,work_voice_channel_id,required_daily_seconds")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    const expectedGuild =
      (cfg as { guild_id?: string } | null)?.guild_id ??
      process.env.DISCORD_GUILD_ID ??
      null;
    if (expectedGuild && payload.guild_id !== expectedGuild) {
      await writeLog(db, "warn", "invalid guild", "Webhook rejected: guild mismatch", {
        event_id: payload.event_id,
        guild_id: payload.guild_id,
      });
      await markProcessed(db, payload.event_id);
      return NextResponse.json({ error: "invalid guild" }, { status: 403 });
    }

    // 8. RECONCILE first: positive narrowing on the discriminated union.
    // JOIN and LEAVE share one schema member, so checking them first and
    // falling through re-widens the type; handling RECONCILE up front keeps
    // the remainder provably JOIN/LEAVE.
    if (payload.event === "RECONCILE") {
      await writeLog(db, "info", "Discord RECONCILE received", "Reconcile webhook received", {
        event_id: payload.event_id,
        member_count: payload.members.length,
      });
      const res = await reconcile(db, {
        guildId: payload.guild_id,
        channelId: payload.channel_id,
        memberDiscordIds: payload.members.map((m) => m.discord_user_id),
        now: new Date(),
      });
      await writeLog(db, "info", "Reconcile completed", "Voice state reconciled", {
        event_id: payload.event_id,
        ...res,
      });
      await markProcessed(db, payload.event_id);
      return NextResponse.json({ ok: true, ...res });
    }

    // 9. Channel validation (only JOIN/LEAVE reach here).
    const expectedChannel =
      (cfg as { work_voice_channel_id?: string } | null)?.work_voice_channel_id ??
      process.env.DISCORD_WORK_CHANNEL_ID ??
      null;
    if (expectedChannel && payload.channel_id !== expectedChannel) {
      await writeLog(db, "warn", "invalid channel", "Webhook rejected: channel mismatch", {
        event_id: payload.event_id,
        channel_id: payload.channel_id,
      });
      await markProcessed(db, payload.event_id);
      return NextResponse.json({ error: "invalid channel" }, { status: 403 });
    }

    // 10. JOIN / LEAVE dispatch. Note: clockIn/clockOut results are unions,
    // so they are returned directly (or nested) rather than spread — spreading
    // a union with overlapping keys into a fresh literal is a TS2783 error.
    if (payload.event === "VOICE_JOIN") {
      await writeLog(db, "info", "Discord JOIN received", "Voice join webhook received", {
        event_id: payload.event_id,
        discord_user_id: payload.discord_user_id,
        channel_id: payload.channel_id,
      });
      const res = await clockIn(db, {
        discordUserId: payload.discord_user_id,
        guildId: payload.guild_id,
        channelId: payload.channel_id,
        channelName: payload.channel_name,
        now: new Date(),
      });
      if (!res.ok) {
        // Unknown/inactive users are safely ignored (200, no bot retry storm).
        await writeLog(db, "warn", "unknown user event", "JOIN ignored: user not registered", {
          event_id: payload.event_id,
          discord_user_id: payload.discord_user_id,
          reason: res.reason,
        });
        await markProcessed(db, payload.event_id);
        return NextResponse.json({ ok: true, ignored: true, reason: res.reason });
      }
      await writeLog(
        db,
        "info",
        "Attendance session created",
        res.deduped ? "Duplicate JOIN deduped" : "Attendance session created",
        { event_id: payload.event_id, session_id: res.session_id },
      );
      await markProcessed(db, payload.event_id);
      return NextResponse.json(res);
    }

    // VOICE_LEAVE (the only remaining event).
    await writeLog(db, "info", "Discord LEAVE received", "Voice leave webhook received", {
      event_id: payload.event_id,
      discord_user_id: payload.discord_user_id,
      channel_id: payload.channel_id,
    });
    const leaveRes = await clockOut(db, {
      discordUserId: payload.discord_user_id,
      now: new Date(),
    });
    if (!leaveRes.ok) {
      await writeLog(db, "warn", "unknown user event", "LEAVE ignored: user not registered", {
        event_id: payload.event_id,
        discord_user_id: payload.discord_user_id,
        reason: leaveRes.reason,
      });
      await markProcessed(db, payload.event_id);
      return NextResponse.json({ ok: true, ignored: true, reason: leaveRes.reason });
    }
    await writeLog(
      db,
      "info",
      "Attendance session closed",
      "closed" in leaveRes && leaveRes.closed
        ? "Attendance session closed"
        : "LEAVE ignored: no active session",
      { event_id: payload.event_id, result: leaveRes },
    );
    await markProcessed(db, payload.event_id);
    return NextResponse.json(leaveRes);
  } catch (err) {
    console.error("voice-event internal error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
