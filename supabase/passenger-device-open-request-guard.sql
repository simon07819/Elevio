-- Prevents multiple open requests from the same device (localStorage key sent with form).
-- Split rows share the same passenger_device_key.
--
-- BLOCKING STATUSES: only statuses where the passenger is WAITING for pickup.
-- Once the passenger is boarded (inside elevator), they should be able to create
-- a new request immediately — the operator will drop them off and the completed
-- status arrives asynchronously. Blocking on "boarded" causes the bug where a
-- passenger cannot re-request after being dropped off.
--
-- TERMINAL STATUSES (completed, cancelled, expired, no_show) never block.
-- "boarded" does NOT block — passenger is in transit and may re-request after dropoff.
-- The passenger_device_key is cleared on completed/cancelled in updateRequestStatus()
-- as a defense-in-depth measure.

alter table requests add column if not exists passenger_device_key uuid;

create or replace function public.passenger_has_open_request(
  p_project_id uuid,
  p_device_key uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from requests r
    where r.project_id = p_project_id
      and r.passenger_device_key = p_device_key
      and r.status in ('pending', 'assigned', 'arriving')
  );
$$;

grant execute on function public.passenger_has_open_request(uuid, uuid) to anon;
grant execute on function public.passenger_has_open_request(uuid, uuid) to authenticated;
