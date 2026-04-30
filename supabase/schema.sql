create extension if not exists "pgcrypto";

do $$ begin
  create type user_role as enum ('passenger', 'operator', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type elevator_direction as enum ('up', 'down', 'idle');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type request_status as enum ('pending', 'assigned', 'arriving', 'boarded', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type request_event_type as enum (
    'created',
    'assigned',
    'arriving',
    'boarded',
    'partial_boarded',
    'deferred',
    'completed',
    'cancelled',
    'message'
  );
exception when duplicate_object then null;
end $$;

create or replace function generate_floor_access_code()
returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;

    exit when not exists (select 1 from floors where access_code = code);
  end loop;

  return code;
end;
$$ language plpgsql;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  address text not null default '',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table projects add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table projects add column if not exists active boolean not null default false;
alter table projects add column if not exists updated_at timestamptz not null default now();
alter table projects add column if not exists archived_at timestamptz;

create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role user_role not null default 'admin',
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  company text not null default '',
  phone text not null default '',
  account_role text not null default 'admin' check (account_role in ('admin', 'superadmin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists floors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  sort_order numeric(10,2) not null,
  qr_token text not null default encode(gen_random_bytes(16), 'hex'),
  access_code text not null default generate_floor_access_code(),
  active boolean not null default true,
  unique(project_id, sort_order),
  unique(project_id, qr_token),
  unique(access_code)
);

alter table floors add column if not exists access_code text;
alter table floors alter column sort_order type numeric(10,2) using sort_order::numeric(10,2);
update floors set access_code = generate_floor_access_code() where access_code is null or access_code = '';
alter table floors alter column access_code set default generate_floor_access_code();
alter table floors alter column access_code set not null;

create table if not exists elevators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  current_floor_id uuid references floors(id) on delete set null,
  direction elevator_direction not null default 'idle',
  capacity integer not null check (capacity > 0),
  current_load integer not null default 0 check (current_load >= 0),
  active boolean not null default true,
  operator_session_id text,
  operator_session_started_at timestamptz,
  operator_session_heartbeat_at timestamptz,
  operator_user_id uuid references auth.users(id) on delete set null,
  operator_tablet_label text,
  service_start_time time not null default time '07:00',
  service_end_time time not null default time '15:00'
);

alter table elevators add column if not exists operator_session_id text;
alter table elevators add column if not exists operator_session_started_at timestamptz;
alter table elevators add column if not exists operator_session_heartbeat_at timestamptz;
alter table elevators add column if not exists operator_user_id uuid references auth.users(id) on delete set null;
alter table elevators add column if not exists operator_tablet_label text;
alter table elevators add column if not exists service_start_time time not null default time '07:00';
alter table elevators add column if not exists service_end_time time not null default time '15:00';

alter table elevators drop constraint if exists elevators_service_hours_order_chk;
alter table elevators drop constraint if exists elevators_service_hours_distinct_chk;
alter table elevators add constraint elevators_service_hours_distinct_chk check (service_start_time <> service_end_time);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role user_role not null,
  project_id uuid references projects(id) on delete set null
);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  elevator_id uuid references elevators(id) on delete set null,
  from_floor_id uuid not null references floors(id) on delete restrict,
  to_floor_id uuid not null references floors(id) on delete restrict,
  direction elevator_direction not null check (direction in ('up', 'down')),
  passenger_count integer not null check (passenger_count > 0),
  original_passenger_count integer not null check (original_passenger_count > 0),
  remaining_passenger_count integer not null check (remaining_passenger_count >= 0),
  split_required boolean not null default false,
  priority boolean not null default false,
  priority_reason text,
  note text,
  status request_status not null default 'pending',
  sequence_number bigint generated always as identity,
  wait_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (from_floor_id <> to_floor_id),
  check (priority = false or nullif(trim(priority_reason), '') is not null)
);

create table if not exists request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  event_type request_event_type not null,
  message text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null
);

create table if not exists operator_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  elevator_id uuid references elevators(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists floors_project_active_idx on floors(project_id, active, sort_order);
create unique index if not exists floors_access_code_idx on floors(access_code);
drop index if exists projects_single_active_idx;
create unique index if not exists projects_owner_single_active_idx on projects(owner_id) where active = true and owner_id is not null;
create index if not exists projects_owner_idx on projects(owner_id, active);
create index if not exists project_members_user_idx on project_members(user_id, project_id);
create index if not exists profiles_account_role_idx on profiles(account_role);
create index if not exists elevators_project_active_idx on elevators(project_id, active);
create unique index if not exists elevators_operator_session_idx on elevators(operator_session_id) where operator_session_id is not null;
create unique index if not exists elevators_project_name_lower_idx on elevators (project_id, lower(trim(name)));
create index if not exists requests_project_status_idx on requests(project_id, status, created_at);
create index if not exists requests_floor_idx on requests(from_floor_id, to_floor_id);
create index if not exists request_events_request_idx on request_events(request_id, created_at);
create index if not exists operator_messages_project_idx on operator_messages(project_id, created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_requests_updated_at on requests;
create trigger set_requests_updated_at
before update on requests
for each row execute function set_updated_at();

drop trigger if exists set_projects_updated_at on projects;
create trigger set_projects_updated_at
before update on projects
for each row execute function set_updated_at();

drop trigger if exists set_profiles_updated_at on profiles;
create trigger set_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

do $$ begin
  alter publication supabase_realtime add table projects;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table floors;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table elevators;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table requests;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table request_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table operator_messages;
exception when duplicate_object then null;
end $$;

alter table projects enable row level security;
alter table project_members enable row level security;
alter table profiles enable row level security;
alter table floors enable row level security;
alter table elevators enable row level security;
alter table users enable row level security;
alter table requests enable row level security;
alter table request_events enable row level security;
alter table operator_messages enable row level security;

create or replace function is_project_member(target_project_id uuid)
returns boolean as $$
  select exists (
    select 1
    from projects p
    where p.id = target_project_id
      and p.owner_id = auth.uid()
  )
  or exists (
    select 1
    from project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
  );
$$ language sql stable security definer;

create or replace function is_superadmin()
returns boolean as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and account_role = 'superadmin'
  );
$$ language sql stable security definer;

drop policy if exists "public demo read projects" on projects;
drop policy if exists "public demo read floors" on floors;
drop policy if exists "public demo read elevators" on elevators;
drop policy if exists "public demo read requests" on requests;
drop policy if exists "public demo insert requests" on requests;
drop policy if exists "public demo update requests" on requests;
drop policy if exists "public demo read events" on request_events;
drop policy if exists "public demo insert events" on request_events;
drop policy if exists "public demo read messages" on operator_messages;
drop policy if exists "public demo insert messages" on operator_messages;
drop policy if exists "public demo read users" on users;
drop policy if exists "admins read owned projects" on projects;
drop policy if exists "public read active projects for qr" on projects;
drop policy if exists "admins create owned projects" on projects;
drop policy if exists "admins update owned projects" on projects;
drop policy if exists "admins delete owned projects" on projects;
drop policy if exists "members read memberships" on project_members;
drop policy if exists "owners manage memberships" on project_members;
drop policy if exists "users read own profile" on profiles;
drop policy if exists "users insert own profile" on profiles;
drop policy if exists "users update own profile" on profiles;
drop policy if exists "superadmins read all profiles" on profiles;
drop policy if exists "superadmins update all profiles" on profiles;
drop policy if exists "public read active floors for qr" on floors;
drop policy if exists "admins manage floors" on floors;
drop policy if exists "admins read elevators" on elevators;
drop policy if exists "admins manage elevators" on elevators;
drop policy if exists "public read active elevators for qr dispatch" on elevators;
drop policy if exists "admins read users" on users;
drop policy if exists "admins manage users" on users;
drop policy if exists "admins read requests" on requests;
drop policy if exists "public insert passenger requests" on requests;
drop policy if exists "admins update requests" on requests;
drop policy if exists "public cancel passenger requests" on requests;
drop policy if exists "admins read events" on request_events;
drop policy if exists "admins insert events" on request_events;
drop policy if exists "admins read messages" on operator_messages;
drop policy if exists "admins insert messages" on operator_messages;

create policy "admins read owned projects" on projects
for select using (owner_id = auth.uid() or is_project_member(id) or is_superadmin());

create policy "public read active projects for qr" on projects
for select using (active = true and archived_at is null);

create policy "admins create owned projects" on projects
for insert with check (owner_id = auth.uid());

create policy "admins update owned projects" on projects
for update using (owner_id = auth.uid() or is_project_member(id) or is_superadmin())
with check (owner_id = auth.uid() or is_project_member(id) or is_superadmin());

create policy "admins delete owned projects" on projects
for delete using (owner_id = auth.uid() or is_superadmin());

create policy "members read memberships" on project_members
for select using (user_id = auth.uid() or is_project_member(project_id) or is_superadmin());

create policy "owners manage memberships" on project_members
for all using (
  exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid())
  or is_superadmin()
) with check (
  exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid())
  or is_superadmin()
);

create policy "users read own profile" on profiles
for select using (id = auth.uid() or is_superadmin());

create policy "users insert own profile" on profiles
for insert with check (id = auth.uid() or is_superadmin());

create policy "users update own profile" on profiles
for update using (id = auth.uid() or is_superadmin())
with check (id = auth.uid() or is_superadmin());

create policy "public read active floors for qr" on floors
for select using (active = true);

create policy "admins manage floors" on floors
for all using (is_project_member(project_id) or is_superadmin())
with check (is_project_member(project_id) or is_superadmin());

create policy "admins read elevators" on elevators
for select using (is_project_member(project_id) or is_superadmin());

create policy "admins manage elevators" on elevators
for all using (is_project_member(project_id) or is_superadmin())
with check (is_project_member(project_id) or is_superadmin());

create policy "public read active elevators for qr dispatch" on elevators
for select using (
  active = true
  and exists (
    select 1
    from projects p
    where p.id = elevators.project_id
      and p.active = true
      and p.archived_at is null
  )
);

create policy "admins read users" on users
for select using (project_id is null or is_project_member(project_id) or is_superadmin());

create policy "admins manage users" on users
for all using (project_id is null or is_project_member(project_id) or is_superadmin())
with check (project_id is null or is_project_member(project_id) or is_superadmin());

create policy "admins read requests" on requests
for select using (is_project_member(project_id) or is_superadmin());

create policy "public insert passenger requests" on requests
for insert with check (
  exists (
    select 1 from floors from_floor
    join floors to_floor on to_floor.id = requests.to_floor_id
    where from_floor.id = requests.from_floor_id
      and from_floor.project_id = requests.project_id
      and to_floor.project_id = requests.project_id
      and from_floor.active = true
      and to_floor.active = true
  )
);

create policy "admins update requests" on requests
for update using (is_project_member(project_id) or is_superadmin())
with check (is_project_member(project_id) or is_superadmin());

create policy "public cancel passenger requests" on requests
for update using (status = 'pending')
with check (status = 'cancelled');

create policy "admins read events" on request_events
for select using (
  exists (select 1 from requests r where r.id = request_id and is_project_member(r.project_id))
  or is_superadmin()
);

create policy "admins insert events" on request_events
for insert with check (
  exists (select 1 from requests r where r.id = request_id and is_project_member(r.project_id))
  or is_superadmin()
);

create policy "admins read messages" on operator_messages
for select using (is_project_member(project_id) or is_superadmin());

create policy "admins insert messages" on operator_messages
for insert with check (is_project_member(project_id) or is_superadmin());

-- ---------------------------------------------------------------------------
-- Brand logos (profile + per-project override for QR posters)
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists company_logo_url text;
alter table profiles add column if not exists project_logo_url text;
alter table projects add column if not exists logo_url text;
alter table projects add column if not exists service_timezone text not null default 'America/Toronto';
alter table projects add column if not exists priorities_enabled boolean not null default true;

-- Storage: public bucket so poster URLs work without signed URLs; paths are scoped by auth.uid() prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-logos',
  'brand-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "brand logos public read" on storage.objects;
drop policy if exists "brand logos owner insert" on storage.objects;
drop policy if exists "brand logos owner update" on storage.objects;
drop policy if exists "brand logos owner delete" on storage.objects;

create policy "brand logos public read"
on storage.objects for select
using (bucket_id = 'brand-logos');

create policy "brand logos owner insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'brand-logos'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "brand logos owner update"
on storage.objects for update to authenticated
using (
  bucket_id = 'brand-logos'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'brand-logos'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "brand logos owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'brand-logos'
  and split_part(name, '/', 1) = auth.uid()::text
);
