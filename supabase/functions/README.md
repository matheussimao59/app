## Edge Functions - Mercado Livre

Este projeto usa duas funcoes:

- `ml-oauth-token`: troca `code` por `access_token`.
- `ml-sync`: sincroniza seller + pedidos (30 dias) sem CORS no navegador.

### 1) Login no Supabase CLI

```bash
supabase login
supabase link --project-ref xawirlorssbucawhnxeh
```

### 2) Configurar secrets da funcao

```bash
supabase secrets set ML_CLIENT_ID=3165979914917791
supabase secrets set ML_CLIENT_SECRET=COLE_AQUI_SEU_CLIENT_SECRET
```

### 3) Deploy das funcoes

```bash
supabase functions deploy ml-oauth-token
supabase functions deploy ml-sync
```

### 4) Teste rapido

Abra o sistema em `https://www.unicaprint.com.br/mercado-livre`, conecte a conta e clique em:

1. `Trocar codigo por token (Edge Function)`
2. `Sincronizar agora`
