alter table elevators add column if not exists manual_full boolean not null default false;

notify pgrst, 'reload schema';
