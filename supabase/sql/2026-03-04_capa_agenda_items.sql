-- Capa Agenda
-- Execute no Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.capa_agenda_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null,
  front_image text not null,
  back_image text not null,
  printed boolean not null default false,
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capa_agenda_items_user_idx on public.capa_agenda_items (user_id, updated_at desc);
create index if not exists capa_agenda_items_printed_idx on public.capa_agenda_items (user_id, printed, updated_at desc);

alter table public.capa_agenda_items enable row level security;

drop policy if exists "capa_agenda_items_select_own" on public.capa_agenda_items;
drop policy if exists "capa_agenda_items_insert_own" on public.capa_agenda_items;
drop policy if exists "capa_agenda_items_update_own" on public.capa_agenda_items;
drop policy if exists "capa_agenda_items_delete_own" on public.capa_agenda_items;

create policy "capa_agenda_items_select_own"
on public.capa_agenda_items
for select
to authenticated
using (auth.uid() = user_id);

create policy "capa_agenda_items_insert_own"
on public.capa_agenda_items
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "capa_agenda_items_update_own"
on public.capa_agenda_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "capa_agenda_items_delete_own"
on public.capa_agenda_items
for delete
to authenticated
using (auth.uid() = user_id);
