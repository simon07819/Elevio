-- ---------------------------------------------------------------------------
-- Passenger landing RPC — replaces the broad anon SELECT policies on
-- projects/floors/elevators by token-scoped SECURITY DEFINER calls.
--
-- BEFORE this migration, three policies allowed any anon caller (the public
-- key is shipped in the browser bundle) to enumerate every active project,
-- floor, and elevator across all customer companies. The QR landing page
-- only needs the rows tied to the floor whose qr_token is being scanned, so
-- we move that lookup behind RPCs and tighten the policies afterward.
--
-- Apply order:
--   1. Run this file in Supabase SQL editor (idempotent).
--   2. Deploy the matching app code that calls these RPCs.
--   3. Once verified in staging, run the policy-tightening section at the
--      bottom (commented out by default to avoid breaking realtime for any
--      passenger client still on the old code path).
-- ---------------------------------------------------------------------------

-- Returns the project + floors + elevator snapshots tied to a given floor token.
-- Anon callers cannot enumerate other projects: they must already hold a token
-- printed on a physical QR poster.
create or replace function public.passenger_landing(p_floor_token text)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_project projects%rowtype;
  v_floor floors%rowtype;
  v_floors json;
  v_elevators json;
begin
  select f.* into v_floor
  from floors f
  where f.qr_token = trim(p_floor_token)
    and f.active = true
  limit 1;

  if v_floor.id is null then
    return json_build_object('ok', false, 'error', 'floor_not_found');
  end if;

  select p.* into v_project
  from projects p
  where p.id = v_floor.project_id
    and p.active = true
    and p.archived_at is null
  limit 1;

  if v_project.id is null then
    return json_build_object('ok', false, 'error', 'project_inactive');
  end if;

  select coalesce(json_agg(row_to_json(f.*) order by f.sort_order asc), '[]'::json) into v_floors
  from (
    select id, project_id, label, sort_order, qr_token, access_code, active
    from floors
    where project_id = v_project.id
      and active = true
    order by sort_order asc
  ) f;

  select coalesce(
    json_agg(
      json_build_object(
        'id', e.id,
        'project_id', e.project_id,
        'name', e.name,
        'current_floor_id', e.current_floor_id,
        'direction', e.direction,
        'capacity', e.capacity,
        'current_load', e.current_load,
        'active', e.active,
        'operator_display_name', e.operator_display_name,
        'operator_session_heartbeat_at', e.operator_session_heartbeat_at,
        'service_start_time', e.service_start_time,
        'service_end_time', e.service_end_time,
        'manual_full', e.manual_full
      )
    ),
    '[]'::json
  ) into v_elevators
  from elevators e
  where e.project_id = v_project.id
    and e.active = true;

  return json_build_object(
    'ok', true,
    'project', json_build_object(
      'id', v_project.id,
      'owner_id', v_project.owner_id,
      'name', v_project.name,
      'address', v_project.address,
      'active', v_project.active,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'archived_at', v_project.archived_at,
      'service_timezone', v_project.service_timezone,
      'priorities_enabled', v_project.priorities_enabled,
      'capacity_enabled', v_project.capacity_enabled,
      'logo_url', v_project.logo_url
    ),
    'floor', json_build_object(
      'id', v_floor.id,
      'project_id', v_floor.project_id,
      'label', v_floor.label,
      'sort_order', v_floor.sort_order,
      'qr_token', v_floor.qr_token,
      'access_code', v_floor.access_code,
      'active', v_floor.active
    ),
    'floors', v_floors,
    'elevators', v_elevators
  );
end;
$$;

grant execute on function public.passenger_landing(text) to anon;
grant execute on function public.passenger_landing(text) to authenticated;

-- Lookup floor by short access code (used by /api/floor-code to redirect from
-- the manual entry form to the QR-token route).
create or replace function public.passenger_floor_by_access_code(p_code text)
returns table (project_id uuid, qr_token text)
language sql
security definer
set search_path = public
stable
as $$
  select f.project_id, f.qr_token
  from floors f
  inner join projects p on p.id = f.project_id
  where f.access_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
    and f.active = true
    and p.active = true
    and p.archived_at is null
  limit 1;
$$;

grant execute on function public.passenger_floor_by_access_code(text) to anon;
grant execute on function public.passenger_floor_by_access_code(text) to authenticated;

-- Lightweight elevator snapshots polling (same shape as the landing payload
-- above). Used by the passenger client to refresh availability without
-- needing a public SELECT policy on the elevators table.
create or replace function public.passenger_elevator_snapshots(p_floor_token text)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_project_id uuid;
  v_elevators json;
begin
  select f.project_id into v_project_id
  from floors f
  inner join projects p on p.id = f.project_id
  where f.qr_token = trim(p_floor_token)
    and f.active = true
    and p.active = true
    and p.archived_at is null
  limit 1;

  if v_project_id is null then
    return json_build_object('ok', false, 'error', 'floor_not_found');
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'id', e.id,
        'project_id', e.project_id,
        'name', e.name,
        'current_floor_id', e.current_floor_id,
        'direction', e.direction,
        'capacity', e.capacity,
        'current_load', e.current_load,
        'active', e.active,
        'operator_display_name', e.operator_display_name,
        'operator_session_heartbeat_at', e.operator_session_heartbeat_at,
        'service_start_time', e.service_start_time,
        'service_end_time', e.service_end_time,
        'manual_full', e.manual_full
      )
    ),
    '[]'::json
  ) into v_elevators
  from elevators e
  where e.project_id = v_project_id
    and e.active = true;

  return json_build_object('ok', true, 'elevators', v_elevators);
end;
$$;

grant execute on function public.passenger_elevator_snapshots(text) to anon;
grant execute on function public.passenger_elevator_snapshots(text) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- STEP 2 (run separately, after staging verification): drop the broad anon
-- read policies. Keep them in place during the rolling deploy so any tab
-- still running the old code keeps working.
-- ---------------------------------------------------------------------------
--
-- drop policy if exists "public read active projects for qr" on projects;
-- drop policy if exists "public read active floors for qr" on floors;
-- drop policy if exists "public read active elevators for qr dispatch" on elevators;
--
-- After dropping the elevators policy, the realtime subscription on the
-- passenger client will no longer deliver elevator changes — make sure the
-- new RPC-based polling is in production before running the drops.
