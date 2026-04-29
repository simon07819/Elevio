-- Colonnes logos marque sur profiles / projects.
-- Executer dans Supabase > SQL Editor si erreur du type :
-- "Could not find the 'company_logo_url' column of 'profiles' in the schema cache"
-- Idempotent.

alter table profiles add column if not exists company_logo_url text;
alter table profiles add column if not exists project_logo_url text;
alter table projects add column if not exists logo_url text;
