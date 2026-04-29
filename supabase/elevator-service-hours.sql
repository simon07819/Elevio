-- Heures de service par ascenseur + fuseau par chantier (à exécuter dans Supabase SQL Editor).
-- Optionnel : créer une vue elevators_public_dispatch avec colonnes réduites pour limiter l'exposition.

alter table projects add column if not exists service_timezone text not null default 'America/Toronto';

alter table elevators add column if not exists service_start_time time not null default time '07:00';
alter table elevators add column if not exists service_end_time time not null default time '15:00';

alter table elevators drop constraint if exists elevators_service_hours_order_chk;
alter table elevators add constraint elevators_service_hours_order_chk check (service_start_time < service_end_time);

drop policy if exists "public read active elevators for qr dispatch" on elevators;

create policy "public read active elevators for qr dispatch" on elevators
for select using (
  active = true
  and exists (
    select 1
    from projects p
    where p.id = elevators.project_id
      and p.active = true
      and p.archived_at is null
  )
);
