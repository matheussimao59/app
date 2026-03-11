# Plano de Migracao do Frontend

Estado atual:
- o frontend usa Supabase diretamente
- autenticacao, banco e storage ainda dependem do Supabase

Estado alvo:
- frontend consumindo API Laravel
- backend usando MySQL
- arquivos fora do banco

Ordem recomendada:
1. autenticacao
2. financeiro
3. capa agenda
4. pedidos de envio e scanner
5. produtos e precificacao

Trocas necessarias no frontend:
- remover `src/lib/supabase.ts`
- criar `src/lib/api.ts`
- trocar chamadas `.from(...).select()` por `fetch` para a API
- trocar login/logout do Supabase por login/logout do backend
- trocar base64 por upload multipart

Rotas iniciais sugeridas:
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/financial/dashboard`
- `GET /api/shipping/orders`
- `POST /api/shipping/orders/import`
- `GET /api/shipping/orders/scan`
- `GET /api/cover-agenda`
- `POST /api/cover-agenda`
- `PATCH /api/cover-agenda/{id}/printed`
- `DELETE /api/cover-agenda/{id}`

Decisoes tecnicas importantes:
- nao salvar imagens em base64 no banco
- usar indice unico em pedidos por `user_id + import_key`
- autenticar API com Sanctum
- manter logs e backups desde o inicio
