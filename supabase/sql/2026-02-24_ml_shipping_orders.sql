-- Menu Enviar Pedido (Mercado Livre)
-- Execute no Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.ml_shipping_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_order_number text,
  ad_name text not null,
  variation text,
  image_url text,
  buyer_notes text,
  observations text,
  product_qty integer not null default 1,
  recipient_name text,
  tracking_number text,
  source_file_name text,
  import_key text not null,
  row_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ml_shipping_orders_qty_check check (product_qty > 0),
  unique (user_id, import_key)
);

create index if not exists ml_shipping_orders_user_idx on public.ml_shipping_orders (user_id, updated_at desc);
create index if not exists ml_shipping_orders_tracking_idx on public.ml_shipping_orders (user_id, tracking_number);

alter table public.ml_shipping_orders enable row level security;

drop policy if exists "ml_shipping_orders_select_own" on public.ml_shipping_orders;
drop policy if exists "ml_shipping_orders_insert_own" on public.ml_shipping_orders;
drop policy if exists "ml_shipping_orders_update_own" on public.ml_shipping_orders;
drop policy if exists "ml_shipping_orders_delete_own" on public.ml_shipping_orders;

create policy "ml_shipping_orders_select_own"
on public.ml_shipping_orders
for select
to authenticated
using (auth.uid() = user_id);

create policy "ml_shipping_orders_insert_own"
on public.ml_shipping_orders
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "ml_shipping_orders_update_own"
on public.ml_shipping_orders
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "ml_shipping_orders_delete_own"
on public.ml_shipping_orders
for delete
to authenticated
using (auth.uid() = user_id);
