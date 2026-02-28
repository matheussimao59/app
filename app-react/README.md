# Migracao para React

Esta pasta contem a base do sistema em `React + Vite + TypeScript`.

## Status atual

- Fluxo principal continua disponivel com sistema completo legado.
- Modulo real nativo em React ja entregue: `Meus Produtos`.
- `Meus Produtos` consulta dados direto no Supabase.

## Pre-requisitos

- Node.js 20+ (ou 18+)
- npm 10+ (ou pnpm/yarn)

## Como executar

1. Configure variaveis:
   - Copie `.env.example` para `.env`.
2. Preencha as credenciais Supabase.
3. Instale dependencias:
   - `npm install`
4. Rode em desenvolvimento:
   - `npm run dev`

## APK Android (Capacitor)

1. Instale dependencias:
   - `npm install`
2. Inicialize Android (uma vez):
   - `npm run android:init`
3. Para atualizar o app Android apos mudancas no React:
   - `npm run android:sync`
4. Abrir no Android Studio:
   - `npm run android:open`
5. No Android Studio:
   - Build > Build Bundle(s) / APK(s) > Build APK(s)

Observacao:
- O menu `Mercado Livre > Enviar Pedido` ja esta com modo de scanner para Android.
- Para operar com leitor de codigo, ative `Ativar scanner Android` e use Enter apos leitura.

## Estrutura atual

- `public/legacy/index.html`: snapshot do sistema legado completo.
- `src/modules/LegacySystemPage.tsx`: renderiza o legado dentro do app React.
- `src/modules/ProductsPage.tsx`: modulo real React consumindo Supabase.
- `src/lib/supabase.ts`: cliente Supabase.

## Proximas fases recomendadas

1. Migrar `Dashboard` para React nativo.
2. Migrar `Precificacao` para React nativo.
3. Migrar `Calendario` e `Configuracoes`.
4. Remover iframe legado quando todos os modulos estiverem nativos.
