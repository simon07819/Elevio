-- Annulation passager depuis le QR : meme jeton d'etage que resume_passenger_request.
-- L'anon ne peut pas UPDATE/SELECT requests hors cas RLS tres limites ; sans RPC le bouton « Annuler » echoue (surtout assigned/arriving).

create or replace function public.cancel_passenger_request(
  p_request_id uuid,
  p_project_id uuid,
  p_floor_token text,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  vf uuid;
  vt uuid;
  ws timestamptz;
  opc int;
  note_trim text;
  eids uuid[];
  pids uuid[];
  i int;
  boarded_sum int;
begin
  note_trim := left(coalesce(nullif(trim(p_note), ''), 'Annulé par le passager.'), 2000);

  select r.from_floor_id, r.to_floor_id, r.wait_started_at, r.original_passenger_count
  into vf, vt, ws, opc
  from requests r
  inner join floors f on f.id = r.from_floor_id and f.project_id = r.project_id
  where r.id = p_request_id
    and r.project_id = p_project_id
    and f.qr_token = trim(p_floor_token)
    and f.active = true
    and r.status in ('pending', 'assigned', 'arriving')
    and exists (
      select 1
      from projects p
      where p.id = r.project_id
        and p.active = true
        and p.archived_at is null
    );

  if vf is null then
    return json_build_object('ok', false, 'error', 'not_found_or_forbidden');
  end if;

  select
    coalesce(array_agg(elevator_id order by elevator_id, project_id), array[]::uuid[]),
    coalesce(array_agg(project_id order by elevator_id, project_id), array[]::uuid[])
  into eids, pids
  from (
    select distinct r.elevator_id, r.project_id
    from requests r
    where r.project_id = p_project_id
      and r.from_floor_id = vf
      and r.to_floor_id = vt
      and r.wait_started_at = ws
      and r.original_passenger_count = opc
      and r.status in ('pending', 'assigned', 'arriving')
      and r.elevator_id is not null
  ) d;

  update requests r
  set
    status = 'cancelled',
    completed_at = now(),
    updated_at = now()
  where r.project_id = p_project_id
    and r.from_floor_id = vf
    and r.to_floor_id = vt
    and r.wait_started_at = ws
    and r.original_passenger_count = opc
    and r.status in ('pending', 'assigned', 'arriving');

  insert into request_events (request_id, event_type, message)
  values (p_request_id, 'cancelled', note_trim);

  if cardinality(eids) > 0 then
    for i in 1..cardinality(eids) loop
      select coalesce(sum(passenger_count), 0)::int into boarded_sum
      from requests
      where elevator_id = eids[i] and status = 'boarded';

      update elevators
      set direction = 'idle'::elevator_direction,
          current_load = boarded_sum
      where id = eids[i] and project_id = pids[i];
    end loop;
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.cancel_passenger_request(uuid, uuid, text, text) to anon;
grant execute on function public.cancel_passenger_request(uuid, uuid, text, text) to authenticated;
