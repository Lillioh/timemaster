-- TimeMaster initial schema
-- Run with: supabase db push  /  or paste into Supabase SQL editor.

-- ── users ────────────────────────────────────────────────────
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text unique,
  discord_username text,
  display_name text,
  avatar_url text,
  email text,
  role text not null default 'USER' check (role in ('ADMIN','USER')),
  active boolean not null default true,
  required_override integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── attendance_sessions ──────────────────────────────────────
create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  discord_user_id text not null,
  guild_id text not null,
  voice_channel_id text not null,
  voice_channel_name text,
  clock_in timestamptz not null,
  clock_out timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  attendance_date date not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clock_out is null or clock_out >= clock_in)
);
create index if not exists idx_sessions_user on public.attendance_sessions(user_id);
create index if not exists idx_sessions_discord on public.attendance_sessions(discord_user_id);
create index if not exists idx_sessions_date on public.attendance_sessions(attendance_date);
create index if not exists idx_sessions_status on public.attendance_sessions(status);
create index if not exists idx_sessions_clock_in on public.attendance_sessions(clock_in);
-- At most one ACTIVE session per user (idempotency for duplicate JOINs).
create unique index if not exists uq_sessions_one_active
  on public.attendance_sessions(user_id) where status = 'ACTIVE';

-- ── daily_attendance ─────────────────────────────────────────
create table if not exists public.daily_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  attendance_date date not null,
  total_seconds integer not null default 0 check (total_seconds >= 0),
  required_seconds integer not null default 28800 check (required_seconds > 0),
  status text not null default 'INCOMPLETE' check (status in ('INCOMPLETE','COMPLETE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, attendance_date)
);
create index if not exists idx_daily_user_date on public.daily_attendance(user_id, attendance_date);
create index if not exists idx_daily_date on public.daily_attendance(attendance_date);

-- ── discord_configuration ────────────────────────────────────
create table if not exists public.discord_configuration (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  work_voice_channel_id text not null,
  work_voice_channel_name text,
  required_daily_seconds integer not null default 28800 check (required_daily_seconds > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_discord_cfg_active on public.discord_configuration(active);

-- ── webhook_events (idempotency ledger) ──────────────────────
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  discord_user_id text,
  guild_id text,
  channel_id text,
  payload jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_webhook_discord on public.webhook_events(discord_user_id);

-- ── system_logs ──────────────────────────────────────────────
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info' check (level in ('info','warn','error')),
  event text not null,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_logs_created on public.system_logs(created_at desc);
create index if not exists idx_logs_event on public.system_logs(event);
