-- ═══════════════════════════════════════════════════════════════════════════
-- billing_plans: editable plan definitions (overrides hardcoded values in plans.ts)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists billing_plans (
  id text primary key,               -- 'starter', 'pro', 'enterprise', etc.
  label text not null,                -- display name
  description text not null default '',
  price_monthly numeric,             -- null = contact sales
  price_annual numeric,              -- null = contact sales
  max_projects integer,              -- null = unlimited
  max_operators integer,             -- null = unlimited
  analytics text not null default 'simple' check (analytics in ('none', 'simple', 'advanced')),
  efficiency_score boolean not null default false,
  business_insights boolean not null default false,
  operator_performance boolean not null default false,
  multi_operator boolean not null default false,
  priority_support boolean not null default false,
  iap_available boolean not null default false,
  contact_sales boolean not null default false,
  popular boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table billing_plans enable row level security;

create policy "authenticated read billing_plans" on billing_plans
  for select to authenticated using (true);

create policy "anon read billing_plans" on billing_plans
  for select to anon using (true);

create policy "superadmin manage billing_plans" on billing_plans
  for all using (is_superadmin())
  with check (is_superadmin());

drop trigger if exists set_billing_plans_updated_at on billing_plans;
create trigger set_billing_plans_updated_at
before update on billing_plans
for each row execute function set_updated_at();

-- Seed from hardcoded plans (idempotent)
insert into billing_plans (id, label, description, price_monthly, price_annual, max_projects, max_operators, analytics, efficiency_score, business_insights, operator_performance, multi_operator, priority_support, iap_available, contact_sales, popular, active, sort_order)
values
  ('starter', 'Starter', 'Reduce wait times — 1 chantier, analytics simples', 199, 1990, 1, 2, 'simple', false, false, false, false, false, true, false, false, true, 1),
  ('pro', 'Pro', 'See where time is lost — smart dispatch, analytics avancés', 499, 4990, 3, 10, 'advanced', true, true, true, true, false, true, false, true, true, 2),
  ('enterprise', 'Enterprise', 'Prove productivity gains — illimité, intégrations, SLA', null, null, null, null, 'advanced', true, true, true, true, true, false, true, false, true, 3)
on conflict (id) do nothing;
