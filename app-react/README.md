# Migração para React

Esta pasta contém a base do sistema em `React + Vite + TypeScript`, mantendo o `index.html` legado intacto.

## Pré-requisitos

- Node.js 20+ (ou 18+)
- npm 10+ (ou pnpm/yarn)

## Como executar

1. Copie as variáveis:
   - `cp .env.example .env` (ou copie manualmente no Windows).
2. Preencha `VITE_SUPABASE_ANON_KEY` no `.env`.
3. Instale dependências:
   - `npm install`
4. Rode em desenvolvimento:
   - `npm run dev`

## Estrutura atual

- `src/components/AuthGate.tsx`: login/cadastro/logout com Supabase.
- `src/components/AppLayout.tsx`: layout principal e navegação.
- `src/modules/*`: páginas iniciais dos módulos.

## Próximas fases recomendadas

1. Migrar `Dashboard` (KPIs, filtros, pedidos).
2. Migrar `Precificação` (insumos, kit, cálculo, simulador).
3. Migrar `Meus Produtos` e detalhes/histórico.
4. Migrar `Calendário` e `Configurações`.
