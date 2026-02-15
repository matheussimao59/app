## Edge Function - Mercado Livre OAuth

Funcao usada pelo frontend React para trocar `code` por `access_token` no Mercado Livre.

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

### 3) Deploy da funcao

```bash
supabase functions deploy ml-oauth-token
```

### 4) Teste rapido

Abra o sistema em `https://www.unicaprint.com.br/mercado-livre`, conecte a conta e clique em:

`Trocar codigo por token (Edge Function)`

