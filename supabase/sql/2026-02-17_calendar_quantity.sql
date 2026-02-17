-- Calendario: quantidade por arte/pedido
-- Execute no Supabase SQL Editor.

alter table if exists public.calendar_orders
add column if not exists quantity integer;

update public.calendar_orders
set quantity = 1
where quantity is null or quantity < 1;

