-- Bucket logos marque (executer dans Supabase SQL Editor si erreur "Bucket not found" a l'upload).
-- Idempotent : peut etre relance plusieurs fois.

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
