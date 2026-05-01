alter table projects add column if not exists capacity_enabled boolean not null default true;

notify pgrst, 'reload schema';
