-- Analytics RPCs for Elevio — read-only, non-blocking.
-- Called from admin and superadmin dashboards.
-- NEVER modifies data. Uses existing tables + request_events for timestamps.

-- ── Project analytics (admin dashboard) ──────────────────────────────────
-- Returns real-time analytics for a specific project.
-- Uses request_events for precise pickup/boarded timestamps.

create or replace function public.get_project_analytics(
  p_project_id uuid,
  p_days int default 7
)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_cutoff timestamptz;
  v_total_requests int;
  v_completed_requests int;
  v_cancelled_requests int;
  v_skipped_count int;
  v_full_events int;
  v_avg_wait_seconds numeric;
  v_avg_travel_seconds numeric;
  v_avg_total_seconds numeric;
  v_busiest_hours json;
  v_top_floors json;
begin
  v_cutoff := now() - (p_days || ' days')::interval;

  -- Core counts
  select
    count(*)::int,
    count(*) filter (where status = 'completed')::int,
    count(*) filter (where status = 'cancelled')::int,
    count(*) filter (where skipped_at is not null)::int
  into v_total_requests, v_completed_requests, v_cancelled_requests, v_skipped_count
  from requests
  where project_id = p_project_id
    and created_at >= v_cutoff;

  -- Full events (manual_full toggles)
  select count(*)::int into v_full_events
  from elevators
  where project_id = p_project_id
    and manual_full = true;

  -- Average wait time: created_at → boarded event timestamp
  select coalesce(avg(extract(epoch from (
    (select min(re.created_at) from request_events re where re.request_id = requests.id and re.event_type = 'boarded')
    - wait_started_at
  )))::numeric, 0)
  into v_avg_wait_seconds
  from requests
  where project_id = p_project_id
    and status in ('completed', 'boarded')
    and created_at >= v_cutoff;

  -- Average travel time: boarded event → completed_at
  select coalesce(avg(extract(epoch from (
    completed_at -
    (select min(re.created_at) from request_events re where re.request_id = requests.id and re.event_type = 'boarded')
  )))::numeric, 0)
  into v_avg_travel_seconds
  from requests
  where project_id = p_project_id
    and status = 'completed'
    and completed_at >= v_cutoff;

  -- Average total time: wait_started_at → completed_at
  select coalesce(avg(extract(epoch from (completed_at - wait_started_at)))::numeric, 0)
  into v_avg_total_seconds
  from requests
  where project_id = p_project_id
    and status = 'completed'
    and completed_at >= v_cutoff;

  -- Busiest hours (request count per hour of day)
  select coalesce(json_agg(row_to_json(q)), '[]'::json) into v_busiest_hours
  from (
    select extract('hour' from created_at)::int as hour, count(*)::int as count
    from requests
    where project_id = p_project_id and created_at >= v_cutoff
    group by 1 order by 2 desc limit 8
  ) q;

  -- Top floors (most requested from_floor)
  select coalesce(json_agg(row_to_json(q)), '[]'::json) into v_top_floors
  from (
    select f.label as floor_label, count(*)::int as count
    from requests r
    join floors f on f.id = r.from_floor_id
    where r.project_id = p_project_id and r.created_at >= v_cutoff
    group by f.label order by 2 desc limit 10
  ) q;

  return json_build_object(
    'total_requests', v_total_requests,
    'completed_requests', v_completed_requests,
    'cancelled_requests', v_cancelled_requests,
    'skipped_count', v_skipped_count,
    'full_events', v_full_events,
    'avg_wait_seconds', round(coalesce(v_avg_wait_seconds, 0)),
    'avg_travel_seconds', round(coalesce(v_avg_travel_seconds, 0)),
    'avg_total_seconds', round(coalesce(v_avg_total_seconds, 0)),
    'busiest_hours', v_busiest_hours,
    'top_floors', v_top_floors,
    'days', p_days
  );
end;
$$;

grant execute on function public.get_project_analytics(uuid, int) to authenticated;

-- ── Platform analytics (superadmin dashboard) ────────────────────────────
-- Returns platform-wide metrics across all projects.

create or replace function public.get_platform_analytics(
  p_days int default 7
)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_cutoff timestamptz;
  v_total_users int;
  v_total_projects int;
  v_active_projects int;
  v_total_requests int;
  v_completed_requests int;
  v_cancelled_requests int;
  v_errors_24h int;
  v_avg_wait_seconds numeric;
  v_requests_per_day json;
begin
  v_cutoff := now() - (p_days || ' days')::interval;

  select count(*)::int into v_total_users from profiles;
  select count(*)::int, count(*) filter (where active)::int into v_total_projects, v_active_projects from projects;

  select
    count(*)::int,
    count(*) filter (where status = 'completed')::int,
    count(*) filter (where status = 'cancelled')::int
  into v_total_requests, v_completed_requests, v_cancelled_requests
  from requests where created_at >= v_cutoff;

  select count(*)::int into v_errors_24h from app_errors where created_at >= now() - interval '24 hours';

  select coalesce(avg(extract(epoch from (completed_at - wait_started_at)))::numeric, 0)
  into v_avg_wait_seconds
  from requests where status = 'completed' and completed_at >= v_cutoff;

  -- Requests per day trend
  select coalesce(json_agg(row_to_json(q)), '[]'::json) into v_requests_per_day
  from (
    select (created_at::date)::text as date, count(*)::int as count
    from requests where created_at >= v_cutoff
    group by 1 order by 1
  ) q;

  return json_build_object(
    'total_users', v_total_users,
    'total_projects', v_total_projects,
    'active_projects', v_active_projects,
    'total_requests', v_total_requests,
    'completed_requests', v_completed_requests,
    'cancelled_requests', v_cancelled_requests,
    'errors_24h', v_errors_24h,
    'avg_wait_seconds', round(coalesce(v_avg_wait_seconds, 0)),
    'requests_per_day', v_requests_per_day,
    'days', p_days
  );
end;
$$;

grant execute on function public.get_platform_analytics(int) to authenticated;
