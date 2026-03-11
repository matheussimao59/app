# Backend Laravel Base

Base inicial para migracao do sistema para VPS com aaPanel.

Objetivo:
- frontend React hospedado no dominio principal
- API Laravel hospedada em subdominio ou pasta separada
- MySQL local na VPS
- arquivos enviados salvos em disco local, fora do banco

Estrutura recomendada:
- `backend-laravel/` -> API
- `backend-laravel/storage/app/public/uploads/` -> imagens e anexos
- `app-react/` -> frontend

Modulos previstos na API:
- autenticacao de usuarios
- financeiro
- capa agenda
- pedidos de envio e scanner
- produtos e precificacao
- uploads de anexos

Fluxo inicial:
1. instalar Laravel real nesta pasta via Composer na VPS
2. copiar o `.env.example`
3. criar banco MySQL
4. executar o SQL inicial em `database/mysql/001_initial_schema.sql`
5. apontar o frontend para a API nova

Observacao:
Os arquivos adicionados aqui formam a base documental e estrutural da migracao. Ainda nao substituem o projeto Laravel instalado por Composer.
