# Deploy no aaPanel

Arquitetura recomendada:
- `site.com` -> frontend React buildado
- `api.site.com` -> Laravel
- MySQL local na VPS
- uploads em `storage/app/public/uploads`

Passos:
1. Instalar no aaPanel:
   - Nginx
   - MySQL 8
   - PHP 8.2
   - Composer
   - Supervisor
2. Criar dois sites:
   - `site.com`
   - `api.site.com`
3. Publicar o frontend em `site.com`
   - rodar `npm run build` dentro de `app-react`
   - enviar a pasta `dist/`
4. Publicar a API em `api.site.com`
   - instalar Laravel real com Composer
   - copiar os arquivos desta base
   - configurar `.env`
5. Criar o banco MySQL e executar:
   - `backend-laravel/database/mysql/001_initial_schema.sql`
6. Criar storage publico:
   - `php artisan storage:link`
7. Configurar SSL nos dois dominios
8. Ajustar o frontend para usar `VITE_API_URL=https://api.site.com`

Pastas de upload sugeridas:
- `uploads/financial/receipts`
- `uploads/financial/invoices`
- `uploads/cover-agenda`
- `uploads/shipping`

Backups minimos:
- dump diario do MySQL
- backup diario da pasta `storage/app/public/uploads`
