-- Priorités chantier : désactivables depuis l'admin (FR + EN dans l'UI).
alter table projects add column if not exists priorities_enabled boolean not null default true;
