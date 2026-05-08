-- Migration: Extend access_codes with provider/source, billing cycle and metadata.
--
-- The original migration (access_codes_flexible.sql) only covered plan + duration.
-- The superadmin "Codes achat" page needs richer metadata to differentiate
-- between the plan (forfait réel attribué) and the provider/source
-- (free, manual, manual_code, revenuecat/app_store, stripe).
--
-- Safe to re-run: every change is idempotent (add column / update constraint).

-- 1) source / provider — distinct from plan
alter table access_codes
  add column if not exists source text not null default 'manual_code';

alter table access_codes
  drop constraint if exists access_codes_source_check;

alter table access_codes
  add constraint access_codes_source_check
    check (source in ('free', 'manual', 'manual_code', 'revenuecat', 'app_store', 'stripe'));

-- 2) billing_interval — monthly / annual / permanent (distinct from duration)
alter table access_codes
  add column if not exists billing_interval text not null default 'monthly';

alter table access_codes
  drop constraint if exists access_codes_billing_interval_check;

alter table access_codes
  add constraint access_codes_billing_interval_check
    check (billing_interval in ('monthly', 'annual', 'permanent'));

-- 3) company / client + internal notes
alter table access_codes
  add column if not exists company_name text not null default '';

alter table access_codes
  add column if not exists notes text not null default '';

-- 4) optional discount percentage on the associated plan
alter table access_codes
  add column if not exists discount_percent integer;

alter table access_codes
  drop constraint if exists access_codes_discount_percent_check;

alter table access_codes
  add constraint access_codes_discount_percent_check
    check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));

-- 5) global expires_at (independent from custom_expires_at, which is tied to duration='custom')
alter table access_codes
  add column if not exists expires_at timestamptz;

-- 6) helpful index for the superadmin list / filter by source
create index if not exists access_codes_source_idx on access_codes (source);
