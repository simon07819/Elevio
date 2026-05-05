-- Evite plusieurs demandes ouvertes depuis le meme telephone (cle localStorage envoyee avec le formulaire).
-- Les lignes fractionnees partagent la meme passenger_device_key.
--
-- ACTIVE_STATUSES: bloque la creation si une demande est en cours de traitement.
-- TERMINAL_STATUSES: completed/cancelled ne bloquent jamais.
-- boarded: le passager est dans l'ascenseur — on ne bloque PAS car il pourrait
-- vouloir re-demander apres avoir ete depose (le statut completed arrive ensuite).

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
      and r.status in ('pending', 'assigned', 'arriving', 'boarded')
  );
$$;

grant execute on function public.passenger_has_open_request(uuid, uuid) to anon;
grant execute on function public.passenger_has_open_request(uuid, uuid) to authenticated;
