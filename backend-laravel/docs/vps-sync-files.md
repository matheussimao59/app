# Arquivos para sincronizar na VPS

O Laravel local ja esta com a base da API pronta. Se na VPS o `php artisan route:list` nao mostrar as rotas `api/*`, copie estes arquivos locais para o Laravel remoto:

- `backend-laravel/bootstrap/app.php`
- `backend-laravel/routes/api.php`
- `backend-laravel/app/Http/Controllers/Api/HealthController.php`
- `backend-laravel/app/Http/Controllers/Api/AuthController.php`
- `backend-laravel/app/Http/Controllers/Api/FinancialController.php`
- `backend-laravel/app/Http/Controllers/Api/ShippingOrderController.php`
- `backend-laravel/app/Http/Controllers/Api/CoverAgendaController.php`
- `backend-laravel/database/mysql/001_initial_schema.sql`
- `backend-laravel/.env.example`

Depois de copiar para a VPS:

```bash
cd /www/wwwroot/api.unicaprint.com.br
php artisan optimize:clear
php artisan route:list
```

O resultado esperado deve incluir:

- `GET|HEAD api/health`
- `POST api/auth/login`
- `GET|HEAD api/auth/me`
- `GET|HEAD api/financial/dashboard`
- `GET|HEAD api/shipping/orders`
- `GET|HEAD api/cover-agenda`

Se ainda nao aparecer:

1. confirme que o arquivo remoto `bootstrap/app.php` possui `api: __DIR__.'/../routes/api.php'`
2. confirme que o arquivo remoto `routes/api.php` existe
3. confirme que os controladores existem em `app/Http/Controllers/Api/`
