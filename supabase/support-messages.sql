-- Support messages table for internal support system
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Question générale',
  name text not null,
  email text not null,
  role text not null default 'passenger',
  project text,
  message text not null,
  status text not null default 'nouveau'
    check (status in ('nouveau', 'en_cours', 'résolu')),
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- RLS: only superadmin can read/write; insert is public (for the form)
alter table support_messages enable row level security;

create policy "Anyone can insert support messages"
  on support_messages for insert
  with check (true);

create policy "Superadmin can read support messages"
  on support_messages for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.account_role = 'superadmin'
    )
  );

create policy "Superadmin can update support messages"
  on support_messages for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.account_role = 'superadmin'
    )
  );

-- Index for sorting by status and date
create index if not exists support_messages_status_idx on support_messages (status, created_at desc);
