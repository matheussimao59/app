# Estrutura atual

Esta e a estrutura oficial do projeto:

- `app/`, `bootstrap/`, `config/`, `database/`, `public/`, `routes/`, `storage/`, `vendor/`
  Backend Laravel principal.
- `app-react/`
  Frontend React/Vite.
- `docs/`
  Guias de deploy e sincronizacao.
- `supabase/`
  Arquivos antigos de referencia. Nao e mais a base ativa do sistema.

## Fluxo de desenvolvimento

1. Backend Laravel roda na raiz.
2. Frontend React roda em `app-react/`.
3. Em desenvolvimento local, o React consome a API da VPS via `VITE_API_URL`.
4. Em producao, o dominio principal pode servir o frontend e a API continua apontando para o Laravel.

## Arquivos de integracao critica

- `routes/api.php`
- `app/Http/Controllers/Api/*`
- `app/Models/User.php`
- `config/cors.php`
- `.env.example`
- `database/mysql/001_initial_schema.sql`
