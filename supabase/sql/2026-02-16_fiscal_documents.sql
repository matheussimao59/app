-- Fase 1 - Emissor de Nota Fiscal
-- Execute este SQL no Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.fiscal_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider_name text not null default 'nuvemfiscal',
  environment text not null default 'homologacao' check (environment in ('homologacao', 'producao')),
  invoice_series text not null default '1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id bigint not null,
  shipment_id bigint,
  status text not null default 'draft_pending_provider',
  invoice_number text,
  invoice_series text,
  access_key text,
  provider_ref text,
  xml_url text,
  pdf_url text,
  error_message text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, order_id)
);

alter table public.fiscal_settings enable row level security;
alter table public.fiscal_documents enable row level security;

drop policy if exists "fiscal_settings_select_own" on public.fiscal_settings;
drop policy if exists "fiscal_settings_insert_own" on public.fiscal_settings;
drop policy if exists "fiscal_settings_update_own" on public.fiscal_settings;
drop policy if exists "fiscal_settings_delete_own" on public.fiscal_settings;

create policy "fiscal_settings_select_own"
on public.fiscal_settings
for select
to authenticated
using (auth.uid() = user_id);

create policy "fiscal_settings_insert_own"
on public.fiscal_settings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "fiscal_settings_update_own"
on public.fiscal_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "fiscal_settings_delete_own"
on public.fiscal_settings
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "fiscal_documents_select_own" on public.fiscal_documents;
drop policy if exists "fiscal_documents_insert_own" on public.fiscal_documents;
drop policy if exists "fiscal_documents_update_own" on public.fiscal_documents;
drop policy if exists "fiscal_documents_delete_own" on public.fiscal_documents;

create policy "fiscal_documents_select_own"
on public.fiscal_documents
for select
to authenticated
using (auth.uid() = user_id);

create policy "fiscal_documents_insert_own"
on public.fiscal_documents
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "fiscal_documents_update_own"
on public.fiscal_documents
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "fiscal_documents_delete_own"
on public.fiscal_documents
for delete
to authenticated
using (auth.uid() = user_id);

