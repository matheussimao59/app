# Unica Print

Este repositorio agora esta organizado assim:

- `app/`, `bootstrap/`, `config/`, `database/`, `public/`, `routes/`, `storage/`, `vendor/`
  Backend Laravel principal.
- `app-react/`
  Frontend React/Vite.
- `docs/`
  Guias operacionais.

## Base oficial

O backend oficial do sistema esta na raiz deste repositorio. A pasta `backend-laravel/` antiga nao deve mais ser usada.

## Desenvolvimento

Backend:

```bash
php artisan serve
```

Frontend:

```bash
cd app-react
npm run dev
```

## Variaveis principais

Backend:

- `APP_URL`
- `DB_*`
- `SANCTUM_STATEFUL_DOMAINS`
- `FRONTEND_URL`

Frontend:

- `VITE_API_URL`

## Rotas API principais

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/financial/dashboard`

## Documentacao

- [estrutura-do-sistema.md](docs/estrutura-do-sistema.md)
- [vps-sync-files.md](docs/vps-sync-files.md)
