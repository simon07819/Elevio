-- Migration: profiles account_role CHECK constraint + passenger role
-- Adds 'operator' and 'passenger' to the valid roles,
-- and ensures Simon's profile is set to superadmin.

-- 1. Drop old constraint and add new one with all 4 roles
alter table profiles drop constraint if exists profiles_account_role_check;
alter table profiles add constraint profiles_account_role_check
  check (account_role in ('passenger', 'operator', 'admin', 'superadmin'));

-- 2. Ensure Simon's profile has superadmin role
-- (Uses the email as identifier since we may not know the user id)
update profiles
set account_role = 'superadmin'
where lower(email) = 'simon@dsdconstruction.ca'
  and account_role != 'superadmin';
