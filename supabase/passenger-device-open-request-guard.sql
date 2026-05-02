-- Evite plusieurs demandes ouvertes depuis le meme telephone (cle localStorage envoyee avec le formulaire).
-- Les lignes fractionnees partagent la meme passenger_device_key.

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
      -- Bloque seulement les demandes qui attendent encore un ramassage.
      -- Une demande "boarded" ne doit pas empecher un nouveau scan apres que le
      -- passager a quitte l'ascenseur, meme si la sync de depose arrive en retard.
      and r.status in ('pending', 'assigned', 'arriving')
  );
$$;

grant execute on function public.passenger_has_open_request(uuid, uuid) to anon;
grant execute on function public.passenger_has_open_request(uuid, uuid) to authenticated;
