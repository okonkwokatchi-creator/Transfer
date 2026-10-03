create table if not exists public.transfer_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size >= 0),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.transfer_texts (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.transfer_files enable row level security;
alter table public.transfer_texts enable row level security;

grant select, insert, delete on public.transfer_files to anon;
grant select, insert, delete on public.transfer_texts to anon;

drop policy if exists "Anonymous users can read transfer files" on public.transfer_files;
drop policy if exists "Anonymous users can add transfer files" on public.transfer_files;
drop policy if exists "Anonymous users can delete transfer files" on public.transfer_files;
create policy "Anonymous users can read transfer files"
  on public.transfer_files for select to anon using (true);
create policy "Anonymous users can add transfer files"
  on public.transfer_files for insert to anon with check (true);
create policy "Anonymous users can delete transfer files"
  on public.transfer_files for delete to anon using (true);

drop policy if exists "Anonymous users can read transfer texts" on public.transfer_texts;
drop policy if exists "Anonymous users can add transfer texts" on public.transfer_texts;
drop policy if exists "Anonymous users can delete transfer texts" on public.transfer_texts;
create policy "Anonymous users can read transfer texts"
  on public.transfer_texts for select to anon using (true);
create policy "Anonymous users can add transfer texts"
  on public.transfer_texts for insert to anon with check (true);
create policy "Anonymous users can delete transfer texts"
  on public.transfer_texts for delete to anon using (true);

insert into storage.buckets (id, name, public)
values ('temporary-files', 'temporary-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Anonymous users can read temporary transfer files" on storage.objects;
drop policy if exists "Anonymous users can upload temporary transfer files" on storage.objects;
drop policy if exists "Anonymous users can delete temporary transfer files" on storage.objects;
create policy "Anonymous users can read temporary transfer files"
  on storage.objects for select to anon
  using (bucket_id = 'temporary-files');
create policy "Anonymous users can upload temporary transfer files"
  on storage.objects for insert to anon
  with check (bucket_id = 'temporary-files');
create policy "Anonymous users can delete temporary transfer files"
  on storage.objects for delete to anon
  using (bucket_id = 'temporary-files');