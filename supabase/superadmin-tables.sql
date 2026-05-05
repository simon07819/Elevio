-- ═══════════════════════════════════════════════════════════════════════════
-- Superadmin tables: site_settings, app_errors, profiles.suspended
-- + RLS policies restricting access to superadmin only
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── profiles: add suspended ──────────────────────────────────────────────
alter table profiles add column if not exists suspended boolean not null default false;
alter table profiles add column if not exists suspended_reason text;
alter table profiles add column if not exists suspended_at timestamptz;

-- ─── site_settings ────────────────────────────────────────────────────────
create table if not exists site_settings (
  key text primary key,
  value text not null default '',
  label text not null default '',
  updated_at timestamptz not null default now()
);

alter table site_settings enable row level security;

-- Anyone authenticated can read site_settings (used for footer, contact, etc.)
create policy "authenticated read site_settings" on site_settings
  for select to authenticated using (true);

-- Anon can also read (public footer text, etc.)
create policy "anon read site_settings" on site_settings
  for select to anon using (true);

-- Only superadmin can modify site_settings
create policy "superadmin manage site_settings" on site_settings
  for all using (is_superadmin())
  with check (is_superadmin());

-- ─── app_errors ──────────────────────────────────────────────────────────
create table if not exists app_errors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  category text not null default 'general',
  level text not null default 'error' check (level in ('info', 'warning', 'error', 'critical')),
  message text not null,
  error text,
  path text,
  status_code integer,
  resolved boolean not null default false,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_app_errors_category on app_errors (category);
create index if not exists idx_app_errors_level on app_errors (level);
create index if not exists idx_app_errors_resolved on app_errors (resolved);
create index if not exists idx_app_errors_created_at on app_errors (created_at desc);
create index if not exists idx_app_errors_project on app_errors (project_id);

alter table app_errors enable row level security;

-- Only superadmin can read app_errors
create policy "superadmin read app_errors" on app_errors
  for select using (is_superadmin());

-- Only superadmin can update/resolve app_errors
create policy "superadmin manage app_errors" on app_errors
  for update using (is_superadmin())
  with check (is_superadmin());

-- Service role or any authenticated user can insert errors (for logging)
create policy "authenticated insert app_errors" on app_errors
  for insert to authenticated with check (true);

-- Anon can also insert (for passenger-side errors)
create policy "anon insert app_errors" on app_errors
  for insert to anon with check (true);

-- ─── Seed default site settings ──────────────────────────────────────────
insert into site_settings (key, value, label) values
  ('support_email', 'support@elevio.app', 'Courriel support'),
  ('support_phone', '', 'Téléphone support'),
  ('footer_text', '© Elevio — Gestion intelligente d''ascenseurs de chantier', 'Texte footer'),
  ('faq_content', '[]', 'FAQ (JSON ou texte)'),
  ('contact_enterprise_message', 'Décrivez votre projet et nous vous recontacterons sous 24h.', 'Message contact enterprise'),
  ('help_app_text', '', 'Texte aide dans l''app'),
  ('legal_privacy_url', '/legal/privacy', 'URL politique confidentialité'),
  ('legal_terms_url', '/legal/terms', 'URL conditions d''utilisation'),
  ('maintenance_message', '', 'Message maintenance (vide = aucun)'),
  ('product_name', 'Elevio', 'Nom du produit'),
  ('site_url', '', 'URL du site')
on conflict (key) do nothing;

-- ─── Update trigger for site_settings.updated_at ─────────────────────────
drop trigger if exists set_site_settings_updated_at on site_settings;
create trigger set_site_settings_updated_at
before update on site_settings
for each row execute function set_updated_at();
