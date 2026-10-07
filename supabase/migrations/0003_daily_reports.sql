-- Daily report delivery ledger (idempotency for the midnight Discord report).
-- The bot inserts one row per attendance_date ONLY after Discord confirms
-- delivery. Startup catch-up and the hourly safety net skip dates already
-- present here, so a date is never reported twice.

create table if not exists public.daily_attendance_reports (
  id uuid primary key default gen_random_uuid(),
  attendance_date date unique not null,
  discord_channel_id text not null,
  message_count integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.daily_attendance_reports enable row level security;
-- No policies: service-role only (same pattern as webhook_events / system_logs).
-- The bot uses SUPABASE_SERVICE_ROLE_KEY; no direct client access.
