# Discord Attendance Bot

Standalone bot that watches a single "work" voice channel and POSTs
`VOICE_JOIN` / `VOICE_LEAVE` / `RECONCILE` events to the TimeMaster
attendance API. Same HMAC scheme as `lib/discord/signature.ts`:

```
signature = hex(HMAC-SHA256(secret, rawBody))  →  header `x-discord-signature`
```

No audio. No message-content intents. Voice state only.

## Requirements

- Node.js 20+
- A Discord application + bot token (https://discord.com/developers/applications)
- The TimeMaster web app running (provides `/api/discord/voice-event`)

## Setup

```bash
cd discord-attendance-bot
cp .env.example .env
# edit .env with real values
npm install
npm run dev
```

### Env vars

| Var | Description |
| --- | ----------- |
| `DISCORD_BOT_TOKEN` | Bot token from the Developer Portal |
| `DISCORD_GUILD_ID` | Server (guild) id to watch |
| `DISCORD_WORK_CHANNEL_ID` | Voice channel id to track |
| `ATTENDANCE_API_URL` | e.g. `http://localhost:3000/api/discord/voice-event` |
| `DISCORD_WEBHOOK_SECRET` | Shared secret — must match the web app's `DISCORD_WEBHOOK_SECRET` |
| `DISCORD_ATTENDANCE_LOG_CHANNEL_ID` | Text channel id for the daily attendance report |
| `SUPABASE_URL` | Supabase project URL (report reads + ledger + retention) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — bot host only, never logged |
| `APP_TIMEZONE` | Optional, default `Asia/Manila` — schedule + calendar dates |
| `HEARTBEAT_INTERVAL_MS` | Optional, default `300000` |

## Invite / permissions

1. Developer Portal → OAuth2 → URL Generator:
   - Scopes: `bot` (only `bot` is needed; no `applications.commands` — this bot registers no slash commands).
   - Bot permissions: **none privileged**. The bot only needs to *see* the voice channel
     (`View Channel`) to receive `voiceStateUpdate` events. It never joins voice,
     so it does **not** need Connect / Speak.
2. Privileged intents: none required. `Guilds` + `GuildVoiceStates` are
   non-privileged and enabled by default — do **not** enable Presence / Server Members / Message Content.
3. Invite the generated URL, then confirm the bot is in the guild and can see the work channel.

## Run

```bash
npm run dev     # tsx src/index.ts (dev)
npm run build   # tsc → dist/
npm start       # node dist/index.js (prod)
```

Health signal: the bot logs `[ready]`, per-event `[voice] JOIN/LEAVE …`,
and a `[health] alive …` heartbeat every `HEARTBEAT_INTERVAL_MS`.

## Daily attendance report

At 00:00 `APP_TIMEZONE` daily, the bot posts the previous calendar day's
report to `DISCORD_ATTENDANCE_LOG_CHANNEL_ID`:

- Source of truth: `attendance_sessions` for that `attendance_date`
  (every session shown individually, chronological; bots excluded via
  Discord's `user.bot` flag — the `users` table has no bot column).
- WORKING = clock-in 1:00 PM–9:00 PM; otherwise CHILLING (by clock-in time).
  ACTIVE sessions show `Still active` and are never closed or deleted.
- Long reports split into `Part i/n` messages (2000-char Discord limit).
- Idempotency: `daily_attendance_reports` records one row per date only
  after Discord confirms delivery — restarts never duplicate a report.
- After archiving, retention deletes `attendance_sessions` older than the
  previous 2 calendar days (`status != 'ACTIVE'` only; `daily_attendance`,
  `users`, config, and `webhook_events` are never touched).
- Apply the ledger migration: `supabase/migrations/0003_daily_reports.sql`.
- Tests: `npm test` (`src/daily-report/report.test.ts`, 14 tests).

## How it works

- `src/discord/voice-events.ts` — `decideTransition(old, new, workId)` maps
  channel changes to `JOIN` / `LEAVE` / `null` (ignored). Same-channel updates
  (mute, deafen, streaming) return `null`.
- `src/api/attendance-client.ts` — signs the raw JSON body with HMAC-SHA256,
  POSTs with `x-discord-signature`, retries 3× with exponential backoff on
  network errors / 5xx / 429. Never logs the secret.
- `src/discord/reconcile.ts` — fetches current non-bot members of the work
  channel and builds a `RECONCILE` payload.

### Reconciliation

Events can be missed (restarts, gateway drops, API downtime). To self-heal,
the bot sends a full snapshot of "who is in the work channel right now":

- on startup (`ready`),
- on gateway resume / shard reconnect (`shardResume`, `shardReady`).

The server (`/api/discord/voice-event` handling `RECONCILE`) diffs the snapshot
against open sessions and closes stale ones / opens missing ones, so the
attendance ledger converges even if individual JOIN/LEAVE events were lost.
Each event carries a unique `event_id` (`evt_<uuid>`) so the server can
deduplicate retries safely.

## Northflank deployment (background worker)

Architecture: Discord Gateway → this bot → HTTPS `POST`
`https://<vercel-domain>/api/discord/voice-event` → Supabase. Northflank
hosts ONLY this bot; the Next.js app stays on Vercel, Supabase stays as-is.

- Service type: **Combined Service** (persistent process, not cron/job).
- Source: GitHub `clavisconsult/clavis`, branch `main`.
- Build context: `discord-attendance-bot` (builds this `package.json`, never
  the root Next.js app). Requires `package.json` + `package-lock.json` in
  that directory (both committed; `node_modules/`, `.env`, `dist/` ignored).
- Build type: Buildpack (Node detected via `engines: >=20`). No Dockerfile.
- Build command: `npm run build` (`tsc` → `dist/`).
- Start command: `npm start` (`node dist/index.js`, runs indefinitely).
- Instances: **1** (multiple replicas would duplicate gateway events,
  reconciliation, and daily reports).
- Networking: **no public ports** (outbound-only: Discord, Vercel, Supabase).
  No HTTP server or health endpoint in this bot by design.
- Env vars (names only — enter values in Northflank, never commit them):
  `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_WORK_CHANNEL_ID`,
  `ATTENDANCE_API_URL` (must be the Vercel URL, never localhost),
  `DISCORD_WEBHOOK_SECRET`, `DISCORD_ATTENDANCE_LOG_CHANNEL_ID`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_TIMEZONE=Asia/Manila`.
- Report channel perms: View Channel, Send Messages, Read Message History
  (not Administrator).
- Verify in logs: `logged in as ClavisTimeMaster`, startup `[reconcile:…]`
  without errors, then live `[voice] JOIN … ok=true status=200`.
- Smoke tests: JOIN → ACTIVE session in Supabase; LEAVE → COMPLETED +
  `daily_attendance` recalculated; restart with a user in-channel → no
  duplicate ACTIVE session; report via `npm run report:test-send`
  (read-only; review the script before running).
