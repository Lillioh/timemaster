-- Row Level Security: users own their data; service-role bypasses RLS for
-- webhook/attendance writes. Admin reads go through server-side service client
-- after a role check, so policies stay conservative.

alter table public.users enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.daily_attendance enable row level security;
alter table public.discord_configuration enable row level security;
alter table public.webhook_events enable row level security;
alter table public.system_logs enable row level security;

-- users: read own row
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

-- attendance_sessions: read own rows
drop policy if exists "sessions_select_own" on public.attendance_sessions;
create policy "sessions_select_own" on public.attendance_sessions
  for select using (auth.uid() = user_id);

-- daily_attendance: read own rows
drop policy if exists "daily_select_own" on public.daily_attendance;
create policy "daily_select_own" on public.daily_attendance
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies for anon/authenticated on attendance tables:
-- all authoritative writes happen via the service-role client in API routes.
-- discord_configuration / webhook_events / system_logs: no direct client access.
