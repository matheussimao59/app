-- Financeiro: anexos de cupom fiscal e nota fiscal por lancamento.
-- Execute no Supabase SQL Editor apos o financial_core.

alter table if exists public.financial_transactions
  add column if not exists receipt_image_data text,
  add column if not exists receipt_image_name text,
  add column if not exists invoice_image_data text,
  add column if not exists invoice_image_name text;

