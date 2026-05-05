-- ---------------------------------------------------------------------------
-- Request archival + cleanup infrastructure
-- ---------------------------------------------------------------------------
-- Strategy: DELETE old terminal requests (no archive table for now).
-- Rationale: the app never queries completed/cancelled history at runtime;
-- analytics will use a daily_stats aggregate table instead. Keeping an
-- archive table adds complexity, storage cost, and migration burden for
-- no current user-facing benefit. If analytics need raw rows later, we
-- can add request_history then and backfill from backups.
-- ---------------------------------------------------------------------------

-- ── Indexes for fast cleanup + active-only queries ──────────────────────

-- Already exists in schema.sql but ensure it's present:
-- requests(project_id, status, created_at)

-- Fast lookup: "which terminal requests on this project are old enough to delete?"
create index if not exists requests_terminal_updated_idx
  on requests(project_id, status, updated_at)
  where status in ('completed', 'cancelled');

-- Fast lookup: active requests for a project (dispatch / operator terminal)
create index if not exists requests_active_project_idx
  on requests(project_id, created_at desc)
  where status in ('pending', 'assigned', 'arriving', 'boarded');

-- Fast lookup: active requests for a specific elevator
create index if not exists requests_active_elevator_idx
  on requests(elevator_id, created_at desc)
  where status in ('pending', 'assigned', 'arriving', 'boarded');

-- Fast lookup: pending requests for dispatch assignment
create index if not exists requests_pending_dispatch_idx
  on requests(project_id, from_floor_id, to_floor_id, status, created_at)
  where status in ('pending', 'assigned', 'arriving');

-- Sessions: find stale operator sessions quickly
create index if not exists elevators_stale_session_idx
  on elevators(project_id, operator_session_heartbeat_at)
  where operator_session_id is not null;

-- ── Daily project stats table ───────────────────────────────────────────

create table if not exists daily_project_stats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stat_date date not null default current_date,
  total_requests integer not null default 0,
  completed_requests integer not null default 0,
  cancelled_requests integer not null default 0,
  avg_wait_seconds integer not null default 0,
  avg_trip_seconds integer not null default 0,
  operator_sessions integer not null default 0,
  peak_load integer not null default 0,
  created_at timestamptz not null default now(),
  unique(project_id, stat_date)
);

alter table daily_project_stats enable row level security;

create policy "admins read project stats" on daily_project_stats
  for select using (is_project_member(project_id) or is_superadmin());

create index if not exists daily_project_stats_project_date_idx
  on daily_project_stats(project_id, stat_date desc);

-- ── Cleanup RPC (called by cron endpoint) ──────────────────────────────

create or replace function public.cleanup_terminal_requests(
  p_completed_age_hours int default 24,
  p_cancelled_age_hours int default 6
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_requests int;
  deleted_events int;
  expired_sessions int;
  deleted_messages int;
  cutoff_completed timestamptz;
  cutoff_cancelled timestamptz;
  heartbeat_cutoff timestamptz;
begin
  cutoff_completed := now() - (p_completed_age_hours || ' hours')::interval;
  cutoff_cancelled := now() - (p_cancelled_age_hours || ' hours')::interval;
  heartbeat_cutoff := now() - interval '10 minutes';

  -- 1. Delete request_events for terminal requests past retention
  delete from request_events
  where request_id in (
    select id from requests
    where status in ('completed', 'cancelled')
      and (
        (status = 'completed' and updated_at < cutoff_completed)
        or (status = 'cancelled' and updated_at < cutoff_cancelled)
      )
  );
  get diagnostics deleted_events = row_count;

  -- 2. Delete terminal requests past retention
  delete from requests
  where status in ('completed', 'cancelled')
    and (
      (status = 'completed' and updated_at < cutoff_completed)
      or (status = 'cancelled' and updated_at < cutoff_cancelled)
    );
  get diagnostics deleted_requests = row_count;

  -- 3. Release stale operator sessions (no heartbeat for 10 min)
  -- Clear session fields but keep elevator active (admin controls active flag)
  update elevators
  set
    operator_session_id = null,
    operator_session_started_at = null,
    operator_session_heartbeat_at = null,
    operator_user_id = null,
    operator_tablet_label = null,
    operator_display_name = null,
    current_load = 0,
    direction = 'idle'::elevator_direction,
    manual_full = false
  where operator_session_id is not null
    and operator_session_heartbeat_at < heartbeat_cutoff;
  get diagnostics expired_sessions = row_count;

  -- 4. Delete old operator messages (>7 days)
  delete from operator_messages
  where created_at < now() - interval '7 days';
  get diagnostics deleted_messages = row_count;

  return json_build_object(
    'ok', true,
    'deleted_requests', deleted_requests,
    'deleted_events', deleted_events,
    'expired_sessions', expired_sessions,
    'deleted_messages', deleted_messages
  );
end;
$$;

grant execute on function public.cleanup_terminal_requests(int, int) to authenticated;
grant execute on function public.cleanup_terminal_requests(int, int) to anon;

-- ── Daily stats computation RPC ─────────────────────────────────────────

create or replace function public.compute_daily_project_stats(
  p_project_id uuid,
  p_stat_date date default current_date - 1
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_completed int;
  v_cancelled int;
  v_avg_wait int;
  v_avg_trip int;
  v_sessions int;
  v_peak int;
begin
  select
    count(*)::int,
    count(*) filter (where status = 'completed')::int,
    count(*) filter (where status = 'cancelled')::int,
    coalesce(avg(extract(epoch from (updated_at - wait_started_at)))::int, 0),
    coalesce(avg(extract(epoch from (completed_at - wait_started_at))) filter (where status = 'completed')::int, 0)
  into v_total, v_completed, v_cancelled, v_avg_wait, v_avg_trip
  from requests
  where project_id = p_project_id
    and created_at >= p_stat_date
    and created_at < p_stat_date + 1;

  select count(distinct operator_session_id)::int
  into v_sessions
  from elevators
  where project_id = p_project_id
    and operator_session_started_at >= p_stat_date
    and operator_session_started_at < p_stat_date + 1;

  select coalesce(max(current_load), 0)::int
  into v_peak
  from elevators
  where project_id = p_project_id;

  insert into daily_project_stats (project_id, stat_date, total_requests, completed_requests, cancelled_requests, avg_wait_seconds, avg_trip_seconds, operator_sessions, peak_load)
  values (p_project_id, p_stat_date, v_total, v_completed, v_cancelled, v_avg_wait, v_avg_trip, v_sessions, v_peak)
  on conflict (project_id, stat_date) do update set
    total_requests = excluded.total_requests,
    completed_requests = excluded.completed_requests,
    cancelled_requests = excluded.cancelled_requests,
    avg_wait_seconds = excluded.avg_wait_seconds,
    avg_trip_seconds = excluded.avg_trip_seconds,
    operator_sessions = excluded.operator_sessions,
    peak_load = excluded.peak_load;

  return json_build_object('ok', true, 'project_id', p_project_id, 'stat_date', p_stat_date);
end;
$$;

grant execute on function public.compute_daily_project_stats(uuid, date) to authenticated;

-- ── Additional indexes for hot queries ─────────────────────────────────

-- app_errors: dashboard superadmin filters by created_at (last 24h)
create index if not exists app_errors_created_at_idx
  on app_errors(created_at desc);

-- subscriptions: billing page looks up by user_id
create index if not exists subscriptions_user_id_idx
  on subscriptions(user_id);

-- user_entitlements: plan guards check by user_id
create index if not exists user_entitlements_user_id_idx
  on user_entitlements(user_id);

-- ── app_errors cleanup (added to existing cron RPC) ────────────────────
-- Delete resolved errors older than 30 days, unresolved older than 90 days.
-- This keeps the table from growing unbounded while preserving recent errors
-- for investigation.

create or replace function public.cleanup_terminal_requests(
  p_completed_age_hours int default 24,
  p_cancelled_age_hours int default 6
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_requests int;
  deleted_events int;
  expired_sessions int;
  deleted_messages int;
  deleted_errors int;
  cutoff_completed timestamptz;
  cutoff_cancelled timestamptz;
  heartbeat_cutoff timestamptz;
begin
  cutoff_completed := now() - (p_completed_age_hours || ' hours')::interval;
  cutoff_cancelled := now() - (p_cancelled_age_hours || ' hours')::interval;
  heartbeat_cutoff := now() - interval '10 minutes';

  -- 1. Delete request_events for terminal requests past retention
  delete from request_events
  where request_id in (
    select id from requests
    where status in ('completed', 'cancelled')
      and (
        (status = 'completed' and updated_at < cutoff_completed)
        or (status = 'cancelled' and updated_at < cutoff_cancelled)
      )
  );
  get diagnostics deleted_events = row_count;

  -- 2. Delete terminal requests past retention
  delete from requests
  where status in ('completed', 'cancelled')
    and (
      (status = 'completed' and updated_at < cutoff_completed)
      or (status = 'cancelled' and updated_at < cutoff_cancelled)
    );
  get diagnostics deleted_requests = row_count;

  -- 3. Release stale operator sessions (no heartbeat for 10 min)
  update elevators
  set
    operator_session_id = null,
    operator_session_started_at = null,
    operator_session_heartbeat_at = null,
    operator_user_id = null,
    operator_tablet_label = null,
    operator_display_name = null,
    current_load = 0,
    direction = 'idle'::elevator_direction,
    manual_full = false
  where operator_session_id is not null
    and operator_session_heartbeat_at < heartbeat_cutoff;
  get diagnostics expired_sessions = row_count;

  -- 4. Delete old operator messages (>7 days)
  delete from operator_messages
  where created_at < now() - interval '7 days';
  get diagnostics deleted_messages = row_count;

  -- 5. Clean up app_errors: resolved > 30 days, unresolved > 90 days
  delete from app_errors
  where (resolved = true and resolved_at < now() - interval '30 days')
     or (resolved = false and created_at < now() - interval '90 days');
  get diagnostics deleted_errors = row_count;

  return json_build_object(
    'ok', true,
    'deleted_requests', deleted_requests,
    'deleted_events', deleted_events,
    'expired_sessions', expired_sessions,
    'deleted_messages', deleted_messages,
    'deleted_errors', deleted_errors
  );
end;
$$;

grant execute on function public.cleanup_terminal_requests(int, int) to authenticated;
grant execute on function public.cleanup_terminal_requests(int, int) to anon;

notify pgrst, 'reload schema';
