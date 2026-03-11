# Arquivos para sincronizar na VPS

A raiz deste repositorio e o backend Laravel oficial. A pasta `backend-laravel/` antiga nao deve mais ser usada.

Se na VPS o `php artisan route:list` nao mostrar as rotas `api/*`, copie estes arquivos locais para o Laravel remoto:

- `bootstrap/app.php`
- `routes/api.php`
- `app/Http/Controllers/Api/HealthController.php`
- `app/Http/Controllers/Api/AuthController.php`
- `app/Http/Controllers/Api/FinancialController.php`
- `app/Http/Controllers/Api/ShippingOrderController.php`
- `app/Http/Controllers/Api/CoverAgendaController.php`
- `app/Models/User.php`
- `config/cors.php`
- `database/mysql/001_initial_schema.sql`
- `.env.example`
- `composer.json`

Depois de copiar para a VPS:

```bash
cd /www/wwwroot/api.unicaprint.com.br
composer install
php artisan optimize:clear
php artisan route:list
```

O resultado esperado deve incluir:

- `GET|HEAD api/health`
- `POST api/auth/register`
- `POST api/auth/login`
- `GET|HEAD api/auth/me`
- `GET|HEAD api/financial/dashboard`
- `GET|HEAD api/shipping/orders`
- `GET|HEAD api/cover-agenda`

Se ainda nao aparecer:

1. confirme que o arquivo remoto `bootstrap/app.php` possui `api: __DIR__.'/../routes/api.php'`
2. confirme que o arquivo remoto `routes/api.php` existe
3. confirme que os controladores existem em `app/Http/Controllers/Api/`
4. confirme que a VPS esta usando esta raiz Laravel e nao uma copia antiga
