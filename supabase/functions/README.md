## Edge Functions - Mercado Livre

Este projeto usa duas funcoes:

- `ml-oauth-token`: troca `code` por `access_token`.
- `ml-sync`: sincroniza seller + pedidos (30 dias) sem CORS no navegador.
- `ml-send-customization`: envia mensagem padrao de personalizacao no pos-venda.
- `nf-emit`: emissao inicial de NF (fase 1, stub para integrar provedor fiscal).
- `nf-status`: consulta status da NF no provedor e retorna XML/PDF/chave quando disponivel.

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
supabase functions deploy ml-send-customization
supabase functions deploy nf-emit
supabase functions deploy nf-status
```

### 4) Teste rapido

Abra o sistema em `https://www.unicaprint.com.br/mercado-livre`, conecte a conta e clique em:

1. `Trocar codigo por token (Edge Function)`
2. `Sincronizar agora`

### 5) Tabelas fiscais (SQL)

No Supabase SQL Editor, execute:

```sql
-- arquivo:
supabase/sql/2026-02-16_fiscal_documents.sql
```

### 6) Secrets para integracao fiscal (fase 2)

```bash
supabase secrets set NFE_PROVIDER_TOKEN=COLE_AQUI_TOKEN_DO_PROVEDOR
supabase secrets set NFE_PROVIDER_BASE_URL=https://api.nuvemfiscal.com.br
supabase secrets set NFE_ISSUE_PATH=/v1/nfe
supabase secrets set NFE_STATUS_PATH_TEMPLATE=/v1/nfe/{id}
```

### 7) Dados fiscais obrigatorios por usuario

Na tela `Nota Fiscal`, cada usuario deve preencher:

- CNPJ, Razao Social, Regime Tributario
- Endereco fiscal (CEP, logradouro, numero, bairro, cidade, UF)
- Referencia do certificado digital (ID/alias no provedor)
