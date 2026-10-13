-- Run once in Supabase → SQL Editor.

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  season text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_orders enable row level security;

drop policy if exists "Users manage their own POs" on public.purchase_orders;
create policy "Users manage their own POs" on public.purchase_orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private bucket for uploaded documents, one folder per user: <user_id>/<po>/<file>
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
  on conflict (id) do nothing;

drop policy if exists "Read own documents" on storage.objects;
create policy "Read own documents" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Upload own documents" on storage.objects;
create policy "Upload own documents" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Delete own documents" on storage.objects;
create policy "Delete own documents" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
