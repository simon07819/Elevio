-- À exécuter une fois dans Supabase → SQL Editor si l’erreur suivante apparaît :
--   new row for relation "elevators" violates check constraint "elevators_service_hours_order_chk"
--
-- Ancienne règle : début < fin (interdit les fenêtres qui traversent minuit).
-- Nouvelle règle : début <> fin seulement (ex. 22:00 → 06:00 OK ; début = fin interdit).
-- Script idempotent : peut être relancé sans erreur.

alter table elevators drop constraint if exists elevators_service_hours_order_chk;
alter table elevators drop constraint if exists elevators_service_hours_distinct_chk;
alter table elevators add constraint elevators_service_hours_distinct_chk check (service_start_time <> service_end_time);
