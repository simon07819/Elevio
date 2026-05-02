-- Resserre les policies RLS sur la table `users` (ancien stockage applicatif).
-- Avant : `project_id is null` etait toujours visible/modifiable par tous les admins ; un user
-- "global" (project_id NULL) introduit par seed ou migration etait expose entre comptes.
-- Apres : seul un superadmin (table profiles, account_role='superadmin') peut voir/modifier
-- les rangees sans project_id ; les autres acces restent scopes au membership projet.
-- Idempotent : peut etre rejoue.

drop policy if exists "admins read users" on users;
drop policy if exists "admins manage users" on users;

create policy "admins read users" on users
for select using (
  (project_id is not null and is_project_member(project_id))
  or is_superadmin()
);

create policy "admins manage users" on users
for all using (
  (project_id is not null and is_project_member(project_id))
  or is_superadmin()
)
with check (
  (project_id is not null and is_project_member(project_id))
  or is_superadmin()
);

notify pgrst, 'reload schema';
