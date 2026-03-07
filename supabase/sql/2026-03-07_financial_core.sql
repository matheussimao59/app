-- Financeiro Core
-- Execute no Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  color text,
  monthly_budget numeric(14,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, kind)
);

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bank text,
  initial_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.financial_categories(id) on delete set null,
  account_id uuid references public.financial_accounts(id) on delete set null,
  entry_type text not null check (entry_type in ('income', 'expense')),
  status text not null check (status in ('pending', 'paid')) default 'pending',
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  due_date date not null,
  paid_date date,
  notes text,
  receipt_image_data text,
  receipt_image_name text,
  invoice_image_data text,
  invoice_image_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_categories_user_idx on public.financial_categories (user_id, kind, active);
create index if not exists financial_accounts_user_idx on public.financial_accounts (user_id, active);
create index if not exists financial_transactions_user_idx on public.financial_transactions (user_id, due_date desc, status);
create index if not exists financial_transactions_category_idx on public.financial_transactions (user_id, category_id);

alter table public.financial_categories enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_transactions enable row level security;

drop policy if exists "financial_categories_select_own" on public.financial_categories;
drop policy if exists "financial_categories_insert_own" on public.financial_categories;
drop policy if exists "financial_categories_update_own" on public.financial_categories;
drop policy if exists "financial_categories_delete_own" on public.financial_categories;

create policy "financial_categories_select_own"
on public.financial_categories
for select to authenticated
using (auth.uid() = user_id);

create policy "financial_categories_insert_own"
on public.financial_categories
for insert to authenticated
with check (auth.uid() = user_id);

create policy "financial_categories_update_own"
on public.financial_categories
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "financial_categories_delete_own"
on public.financial_categories
for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "financial_accounts_select_own" on public.financial_accounts;
drop policy if exists "financial_accounts_insert_own" on public.financial_accounts;
drop policy if exists "financial_accounts_update_own" on public.financial_accounts;
drop policy if exists "financial_accounts_delete_own" on public.financial_accounts;

create policy "financial_accounts_select_own"
on public.financial_accounts
for select to authenticated
using (auth.uid() = user_id);

create policy "financial_accounts_insert_own"
on public.financial_accounts
for insert to authenticated
with check (auth.uid() = user_id);

create policy "financial_accounts_update_own"
on public.financial_accounts
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "financial_accounts_delete_own"
on public.financial_accounts
for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "financial_transactions_select_own" on public.financial_transactions;
drop policy if exists "financial_transactions_insert_own" on public.financial_transactions;
drop policy if exists "financial_transactions_update_own" on public.financial_transactions;
drop policy if exists "financial_transactions_delete_own" on public.financial_transactions;

create policy "financial_transactions_select_own"
on public.financial_transactions
for select to authenticated
using (auth.uid() = user_id);

create policy "financial_transactions_insert_own"
on public.financial_transactions
for insert to authenticated
with check (auth.uid() = user_id);

create policy "financial_transactions_update_own"
on public.financial_transactions
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "financial_transactions_delete_own"
on public.financial_transactions
for delete to authenticated
using (auth.uid() = user_id);
