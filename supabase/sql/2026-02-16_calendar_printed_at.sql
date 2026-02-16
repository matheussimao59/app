-- Calendario: expirar itens impressos apos 5 dias da finalizacao.
-- Execute no Supabase SQL Editor.

alter table if exists public.calendar_orders
add column if not exists printed_at timestamptz;

