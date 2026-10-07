import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { sendEvent } from "./api/attendance-client.js";
import { buildJoinLeavePayload, decideTransition } from "./discord/voice-events.js";
import { buildReconcilePayloadFromGuild } from "./discord/reconcile.js";
import { startDailyReportScheduler } from "./daily-report/job.js";
import { newEventId } from "./utils/event-id.js";

// No audio, no message-content intents. Voice state only.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Guards against overlapping reconciliations (e.g. ClientReady and
// ShardReady both firing during startup must not POST simultaneously).
let reconcileInFlight = false;

// Delay before the first startup reconciliation so a locally-hosted
// Next.js API has time to finish booting before the bot POSTs to it.
const STARTUP_DELAY_MS = 2500;
const startedAt = Date.now();

async function reconcile(reason: string): Promise<void> {
  if (reconcileInFlight) {
    console.log(`[reconcile:${reason}] skipped: another reconciliation in flight`);
    return;
  }
  reconcileInFlight = true;
  try {
    const guild = await client.guilds.fetch(config.guildId).catch(() => null);
    if (!guild) {
      console.error(`[reconcile:${reason}] guild not found: ${config.guildId}`);
      return;
    }
    const payload = await buildReconcilePayloadFromGuild(
      guild,
      config.workChannelId,
      newEventId("evt"),
    );
    const res = await sendEvent(payload);
    console.log(
      `[reconcile:${reason}] members=${payload.members.length} ok=${res.ok} status=${res.status} body=${res.body}`,
    );
  } catch (err) {
    console.error(
      `[reconcile:${reason}] failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    reconcileInFlight = false;
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[ready] logged in as ${readyClient.user.tag}`);
  console.log(`[ready] guild=${config.guildId} workChannel=${config.workChannelId}`);
  console.log(`[ready] api=${config.attendanceApiUrl}`);
  // Delayed so a locally-hosted API can finish booting first.
  setTimeout(() => {
    void reconcile("ready");
  }, STARTUP_DELAY_MS);
  // Midnight daily-report scheduler (own catch-up + safety net included).
  startDailyReportScheduler(client);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const transition = decideTransition(
    oldState.channelId,
    newState.channelId,
    config.workChannelId,
  );
  if (!transition) return;

  const memberId = newState.id ?? oldState.id;
  if (!memberId) return;

  // For JOIN the relevant channel is the new one; for LEAVE it's the old one.
  const channelId =
    transition === "JOIN" ? (newState.channelId ?? config.workChannelId) : (oldState.channelId ?? config.workChannelId);
  const channelName =
    transition === "JOIN"
      ? (newState.channel?.name ?? undefined)
      : (oldState.channel?.name ?? undefined);

  const payload = buildJoinLeavePayload({
    transition,
    eventId: newEventId("evt"),
    guildId: newState.guild.id ?? oldState.guild.id,
    discordUserId: memberId,
    channelId,
    channelName,
  });

  const res = await sendEvent(payload);
  console.log(
    `[voice] ${transition} user=${memberId} channel=${channelId} ok=${res.ok} status=${res.status} body=${res.body}`,
  );
});

// Re-reconcile after gateway resumes / reconnects so missed events self-heal.
client.on(Events.ShardResume, async () => {
  console.log("[shard] resumed — reconciling");
  await reconcile("resume");
});
client.on(Events.ShardReady, async () => {
  console.log("[shard] ready — reconciling");
  // During process startup the API may still be booting: wait out the
  // remainder of the startup delay. After startup, reconcile immediately.
  const elapsed = Date.now() - startedAt;
  if (elapsed < STARTUP_DELAY_MS) {
    setTimeout(() => {
      void reconcile("shard-ready");
    }, STARTUP_DELAY_MS - elapsed);
    return;
  }
  await reconcile("shard-ready");
});

// Periodic heartbeat so hosting logs show the bot is alive.
const heartbeatMs = Number.isFinite(config.heartbeatIntervalMs)
  ? config.heartbeatIntervalMs
  : 300_000;
setInterval(() => {
  const guilds = client.guilds.cache.size;
  console.log(`[health] alive guilds=${guilds} uptime=${Math.round(process.uptime())}s`);
}, heartbeatMs).unref();

function shutdown(signal: string): void {
  console.log(`[shutdown] received ${signal}`);
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (err) => {
  console.error(`[unhandledRejection] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
});

await client.login(config.botToken);
