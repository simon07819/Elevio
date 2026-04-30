-- Reprise securisee d'une demande passager : meme QR (token d'etage) + id de demande.
-- Sans ceci l'anon ne peut pas SELECT sur requests (RLS), donc le telephone perdait l'affichage apres fermeture de l'app.
-- Idempotent : peut etre reexecute.

create or replace function public.resume_passenger_request(
  p_request_id uuid,
  p_project_id uuid,
  p_floor_token text
)
returns table (
  id uuid,
  status text,
  wait_started_at timestamptz,
  from_floor_id uuid,
  to_floor_id uuid,
  passenger_count int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id,
    r.status::text,
    r.wait_started_at,
    r.from_floor_id,
    r.to_floor_id,
    r.passenger_count
  from requests r
  inner join floors f
    on f.id = r.from_floor_id
    and f.project_id = r.project_id
  where r.id = p_request_id
    and r.project_id = p_project_id
    and f.qr_token = p_floor_token
    and f.active = true
    and exists (
      select 1
      from projects p
      where p.id = r.project_id
        and p.active = true
        and p.archived_at is null
    )
  limit 1;
$$;

grant execute on function public.resume_passenger_request(uuid, uuid, text) to anon;
grant execute on function public.resume_passenger_request(uuid, uuid, text) to authenticated;
