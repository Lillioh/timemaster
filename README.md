# TimeMaster — Discord Voice Attendance & Time Tracking

TimeMaster tracks work hours from Discord voice-channel presence. A small
persistent bot watches a configured "work" voice channel and POSTs signed
`VOICE_JOIN` / `VOICE_LEAVE` / `RECONCILE` events to a Next.js API, which
records attendance sessions in Supabase and aggregates per-day totals.

## Architecture

```text
 Discord voice channel
        │  voiceStateUpdate
        ▼
 discord-attendance-bot (Node, persistent host)
  decide(old,new,WORK): JOIN | LEAVE | null
        │  POST /api/discord/voice-event  (HMAC header)
        ▼
 Next.js API  app/api/discord/voice-event/route.ts
  verify sig → rate-limit → zod validate → webhook_events ledger
  → clockIn / clockOut / reconcile → daily_attendance recalc
        │
        ▼
 Supabase Postgres (users, attendance_sessions, daily_attendance,
                   discord_configuration, webhook_events, system_logs)
        │
        ▼
 Next.js dashboard (Supabase SSR, role-based: ADMIN / USER)
```

Key invariants:

- **At most one ACTIVE session per user** — enforced by partial unique index
  `uq_sessions_one_active` + application-level dedupe in `clockIn`.
- **Webhook idempotency** — `webhook_events.event_id` is unique; a replayed
  `event_id` returns `{ ok: true, deduped: true }` without side effects.
- **Midnight split** — sessions crossing local midnight are split per
  `attendance_date` in `clockOut` so daily `SUM(duration)` stays correct.
- **Completion rule** — `dailyStatusFor(total, required)` is
  `COMPLETE iff total >= required` (default 8h = 28800s).

## Prerequisites

- Node.js ≥ 20, npm
- Supabase project (or local `supabase` CLI stack)
- Discord application + bot token with `GuildVoiceStates` intent, invited to
  your guild

## Environment setup

```bash
cp .env.example .env
# fill in Supabase URL/keys + Discord IDs + webhook secret (min 32 chars)

cp discord-attendance-bot/.env.example discord-attendance-bot/.env 2>/dev/null || true
# DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_WORK_CHANNEL_ID,
# ATTENDANCE_API_URL, DISCORD_WEBHOOK_SECRET, RECONCILE_INTERVAL_MS
```

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | anon key (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | web (server only) | service-role for webhook route |
| `DISCORD_WEBHOOK_SECRET` | web + bot | HMAC-SHA256 shared secret |
| `DISCORD_GUILD_ID` | web (fallback) + bot | expected guild |
| `DISCORD_WORK_CHANNEL_ID` | web (fallback) + bot | tracked voice channel |
| `APP_TIMEZONE` | web | IANA tz for `attendance_date` (e.g. `Asia/Manila`) |
| `NEXT_PUBLIC_APP_TIMEZONE` | web | display tz hint for the client |

## Supabase migration instructions

SQL-first migrations live in `supabase/migrations/`:

- `0001_init.sql` — tables, indexes, `uq_sessions_one_active`, checks
  (`duration_seconds >= 0`, `clock_out >= clock_in`).
- `0002_rls.sql` — row-level security policies.

Apply with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

Or paste each file (in order) into the Supabase SQL editor. Verify:

```sql
select * from pg_indexes where indexname = 'uq_sessions_one_active';
```

## Dev

```bash
npm install
npm run dev        # Next.js web app (http://localhost:3000)

cd discord-attendance-bot
npm install
npm run dev        # bot (tsx watch); needs .env + intents
```

Typecheck / lint / tests:

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm test           # vitest run
```

## Webhook contract

`POST /api/discord/voice-event` — JSON body, raw bytes signed:

```text
x-discord-signature: hex(HMAC-SHA256(DISCORD_WEBHOOK_SECRET, rawBody))
```

`VOICE_JOIN` / `VOICE_LEAVE`:

```json
{
  "event_id": "evt-uuid-or-unique-string",
  "event": "VOICE_JOIN",
  "guild_id": "123",
  "channel_id": "456",
  "discord_user_id": "789",
  "channel_name": "work-room (optional)",
  "timestamp": "2026-01-01T09:00:00.000Z"
}
```

`RECONCILE` (periodic full-state sync from the bot):

```json
{
  "event_id": "rec-uuid",
  "event": "RECONCILE",
  "guild_id": "123",
  "channel_id": "456",
  "timestamp": "2026-01-01T09:05:00.000Z",
  "members": [{ "discord_user_id": "789" }]
}
```

Responses: `200 { ok: true, ... }`, `200 { ok: true, deduped: true }` on
replay, `200 { ok: true, ignored: true, reason }` for unknown/inactive users,
`401` bad signature, `403` guild/channel mismatch, `429` rate-limited
(120 req/min/IP), `GET → 405`.

Node signing snippet:

```js
import { createHmac, randomUUID } from "node:crypto";
const body = JSON.stringify({
  event_id: randomUUID(),
  event: "VOICE_JOIN",
  guild_id: process.env.DISCORD_GUILD_ID,
  channel_id: process.env.DISCORD_WORK_CHANNEL_ID,
  discord_user_id: "user-id",
  timestamp: new Date().toISOString(),
});
const sig = createHmac("sha256", process.env.DISCORD_WEBHOOK_SECRET)
  .update(body, "utf8").digest("hex");
await fetch(`${APP_URL}/api/discord/voice-event`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-discord-signature": sig },
  body,
});
```

## Reconciliation

Voice events can be lost (restarts, network blips). The bot sends `RECONCILE`
with the current member list on an interval (`RECONCILE_INTERVAL_MS`, ~60s):

- present member without ACTIVE session → `clockIn` (opened)
- ACTIVE session whose user is absent → `clockOut` (closed)

Response: `{ ok: true, opened: [...], closed: [...], alreadyCorrect: bool }`.
Reconcile is idempotent and safe to run frequently.

## Testing

```bash
npm test   # vitest run
```

Suites in `tests/`:

| File | Covers |
|---|---|
| `attendance.test.ts` | `calculateDurationSeconds` (never negative), `splitDurationByDate` midnight split (23:00→01:00 UTC = 3600+3600) + same-day, `dailyStatusFor` (28800→COMPLETE, 27000→INCOMPLETE, 30000→COMPLETE), `formatHm` |
| `signature.test.ts` | sign→verify true, wrong secret / tampered body / missing sig false |
| `validation.test.ts` | valid JOIN passes, bad event rejected, RECONCILE w/ members passes, missing `event_id` fails |
| `transitions.test.ts` | inline mirror of bot `decide()`: null→work JOIN, other→work JOIN, work→null LEAVE, work→other LEAVE, other→other null, work→work null |
| `idempotency.test.ts` | `event_id` Set dedupe, duplicate JOIN → `deduped:true` via stub, LEAVE with no ACTIVE → `closed:false` without throw |

## Deployment

- **Web (Vercel):** import the repo, set all web env vars, deploy. Uses
  standard Next.js build (`next build`). No persistent connections needed.
- **Bot (persistent host — NOT serverless):** the bot holds a Discord gateway
  WebSocket, so it must run on a long-lived host (VPS, Fly.io, Railway,
  Render worker). Set the bot `.env` (`ATTENDANCE_API_URL` pointing at the
  Vercel URL) and run `npm run build && npm start`. Vercel/serverless will
  kill the gateway connection — do not host the bot there.

## Security checklist

- [ ] `DISCORD_WEBHOOK_SECRET` ≥ 32 random chars, identical in web + bot envs
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only on the server (never `NEXT_PUBLIC_*`)
- [ ] Webhook verifies HMAC with `timingSafeEqual` before parsing
- [ ] Rate limit (120/min/IP) on the webhook route
- [ ] Guild + work-channel allow-list enforced server-side (DB config wins)
- [ ] RLS enabled (`0002_rls.sql`); anon key only reads via policies
- [ ] Unknown/inactive users ignored with 200 (no user-enumeration oracle)
- [ ] `webhook_events` ledger prevents replay side effects

## Timezone note

`attendance_date` is derived from the clock-in instant in `APP_TIMEZONE`
(default `UTC`; production e.g. `Asia/Manila`). Midnight-crossing sessions are
split across local dates at close time. Changing `APP_TIMEZONE` after data
exists will shift date attribution for new sessions only — pick it once and
keep web + reporting consistent.

## Structure map (thesis-friendly)

```text
app/api/discord/voice-event/route.ts  webhook entry: auth → validate → dispatch
lib/attendance/clock-in.ts             JOIN → ACTIVE session (dedupe + daily row)
lib/attendance/clock-out.ts            LEAVE → close (+ midnight split) + recalc
lib/attendance/reconcile.ts            periodic state sync (open missing / close stale)
lib/attendance/calculate-duration.ts   duration math, midnight split, status rule
lib/attendance/daily-total.ts          SUM(duration) → daily_attendance upsert
lib/attendance/constants.ts            REQUIRED_DAILY_SECONDS, getAppTimezone()
lib/discord/signature.ts               HMAC-SHA256 sign / timing-safe verify
lib/validation/discord-event.ts        zod webhook contract (JOIN/LEAVE/RECONCILE)
lib/utils/rate-limit.ts                in-memory per-IP throttle (swap for Redis)
lib/utils/format.ts                    formatHm / formatHms display helpers
lib/supabase/*                         browser / server / service clients
supabase/migrations/                   0001_init (schema) / 0002_rls (policies)
discord-attendance-bot/                gateway bot: decide() → signed POSTs
tests/                                 vitest suites (see Testing table)
```
