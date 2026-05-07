-- Migration: Replace enterprise_activation_codes with flexible access_codes
--
-- The old table only supported single-use Enterprise/Business codes.
-- The new table supports:
-- - All plan types (starter, pro, business, enterprise)
-- - Duration options (permanent, 7d, 30d, 1y, custom expiry)
-- - Max usage count (multi-use codes)
-- - Enable/disable toggle
-- - Usage tracking (how many times used, by whom)
-- - Case-insensitive code lookup

-- Step 1: Create the new access_codes table
create table if not exists access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default '',
  description text not null default '',
  plan text not null check (plan in ('starter', 'pro', 'business', 'enterprise')),
  duration text not null default 'permanent'
    check (duration in ('permanent', '7d', '30d', '1y', 'custom')),
  custom_expires_at timestamptz,  -- only used when duration = 'custom'
  max_uses integer not null default 1,  -- null = unlimited
  current_uses integer not null default 0,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for code lookup (only active codes)
create index if not exists access_codes_code_idx on access_codes (code) where enabled = true;

-- RLS: only superadmin can read/write, but activation is via server action
alter table access_codes enable row level security;

create policy "Superadmin can read access codes"
  on access_codes for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.account_role = 'superadmin'
    )
  );

create policy "Superadmin can insert access codes"
  on access_codes for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.account_role = 'superadmin'
    )
  );

create policy "Superadmin can update access codes"
  on access_codes for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.account_role = 'superadmin'
    )
  );

create policy "Superadmin can delete access codes"
  on access_codes for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.account_role = 'superadmin'
    )
  );

-- Step 2: Create access_code_usage table (tracks who used each code)
create table if not exists access_code_usage (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid not null references access_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null default '',
  plan_at_activation text not null,
  activated_at timestamptz not null default now()
);

create index if not exists access_code_usage_code_idx on access_code_usage (access_code_id);
create index if not exists access_code_usage_user_idx on access_code_usage (user_id);

alter table access_code_usage enable row level security;

create policy "Superadmin can read code usage"
  on access_code_usage for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.account_role = 'superadmin'
    )
  );

-- Step 3: Add activated_via 'stripe' to user_entitlements check constraint
-- (This was missing — stripe subscriptions need this value)
ALTER TABLE user_entitlements DROP CONSTRAINT IF EXISTS user_entitlements_activated_via_check;
ALTER TABLE user_entitlements ADD CONSTRAINT user_entitlements_activated_via_check
  CHECK (activated_via IN ('default', 'iap', 'activation_code', 'admin', 'manual', 'stripe', 'revenuecat'));

-- Step 4: Update user_entitlements to reference new access_codes table
-- (activation_code_id already references enterprise_activation_codes, update it)
-- First, drop the old FK constraint
ALTER TABLE user_entitlements DROP CONSTRAINT IF EXISTS user_entitlements_activation_code_id_fkey;
-- Add new FK referencing access_codes
ALTER TABLE user_entitlements ADD CONSTRAINT user_entitlements_activation_code_id_fkey
  FOREIGN KEY (activation_code_id) REFERENCES access_codes(id) ON DELETE SET NULL;
