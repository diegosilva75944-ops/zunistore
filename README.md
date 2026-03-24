# ZuniStore

Marketplace afiliado profissional (inspirado em grandes marketplaces), com **SEO, performance e escalabilidade** como prioridade.

Importante: o ZuniStore **não vende**. O botão **Comprar** sempre abre em **nova aba** e redireciona para o produto original usando **link afiliado**.

## Stack

- Next.js (App Router) + TypeScript
- TailwindCSS
- API PostgREST/Supabase API + PostgreSQL
- `@supabase/supabase-js` (cliente HTTP para API de dados)
- Admin com autenticação própria (bcrypt) e sessão via cookie **httpOnly**
- Importação de produtos **exclusivamente via Extensão Chrome** (sem API oficial do Mercado Livre; sem scraping backend por padrão)

## Importante sobre PostgreSQL local

Este projeto **não conecta no PostgreSQL diretamente**.  
Ele usa uma **API de dados compatível com PostgREST** (o Supabase já entrega isso pronto).

Se você migrou para servidor próprio com PostgreSQL local, você precisa de uma destas opções:

- Subir stack Supabase self-hosted (ou apenas PostgREST + JWT config)
- Manter uma API compatível com as rotas usadas pelo app

Somente restaurar o dump no PostgreSQL não é suficiente para o app funcionar.

## Setup do banco (self-hosted)

- Restaurar dump e/ou aplicar:
  - `supabase/schema.sql`
  - `supabase/seed.sql` (ajuste credenciais antes)
- Garantir que a API PostgREST enxergue o schema/tabelas e permissões

## Variáveis de ambiente

Crie um `.env.local` baseado em `.env.example`.

Principais variáveis em produção:

- `NEXT_PUBLIC_SITE_URL=https://seu-dominio`
- `SUPABASE_URL=http://postgrest:3000` (ou `DB_API_URL`)
- `SUPABASE_ANON_KEY=...` (ou `DB_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY=...` (ou `DB_SERVICE_ROLE_KEY`)
- `ADMIN_JWT_SECRET=...` (>= 32 chars)

## Rodar local

```bash
npm install
npm run dev
```

- Site: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

## Extensão Chrome (Importador)

Código da extensão em `zunistore-importer/`.

- Em `Admin -> Tokens`, crie um token (ele aparece 1 vez)
- Em `Admin -> Importação`, copie a Base URL
- Abra a extensão e configure em `Opções`
- No popup, informe:
  - **URL da página do produto** (Mercado Livre) — ou use "Usar página atual" se estiver na aba do produto
  - **Link de afiliado** (o que aparecerá no botão Comprar)
  - Clique em **Importar**

## Deploy no Coolify

O projeto agora inclui `Dockerfile` multi-stage e roda com `next start` standalone.

Passos sugeridos no Coolify:

1. Criar recurso da aplicação apontando para este repositório.
2. Usar build por `Dockerfile`.
3. Definir porta `3000`.
4. Configurar todas as variáveis de ambiente listadas acima.
5. Definir `CRON_SECRET` (string longa e aleatória) para o job de validação de links abaixo.

### Tarefas agendadas (a cada 2 horas)

O app expõe:

- `GET /api/cron/sync-prices` — sincroniza até 50 produtos por chamada (preços / remoção se a URL não existir); **sem autenticação** (proteja por rede ou coloque atrás de IP restrito se possível).
- `GET /api/cron/validate-affiliate-links?limit=15` — revalida links de afiliado em lote; **exige** a variável `CRON_SECRET` e um dos mecanismos: header `Authorization: Bearer <CRON_SECRET>`, header `x-cron-secret: <CRON_SECRET>` ou query `?secret=<CRON_SECRET>` (não recomendado em logs).

**Coolify:** em *Scheduled Tasks* (ou equivalente), crie duas tarefas com periodicidade “every 2 hours” (ou cron `0 */2 * * *`), por exemplo:

1. Comando / request: `GET https://<seu-dominio>/api/cron/sync-prices`
2. Comando / request: `GET https://<seu-dominio>/api/cron/validate-affiliate-links?limit=15` com header `Authorization: Bearer <valor de CRON_SECRET>` (definido nas env vars do mesmo serviço).

**Ubuntu (crontab do usuário ou root):** ajuste domínio e segredo; `-fsS` falha em erro HTTP e mostra mensagem no stderr.

```bash
CRON_SECRET='cole-o-mesmo-valor-da-env-CRON_SECRET'
SITE='https://seu-dominio.com'

crontab -e
```

Adicione (ambas a cada 2 horas, no minuto 0 e 15 para não disparar tudo junto):

```
0 */2 * * * curl -fsS "${SITE}/api/cron/sync-prices" -o /dev/null
15 */2 * * * curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "${SITE}/api/cron/validate-affiliate-links?limit=15" -o /dev/null
```

No crontab as variáveis `SITE` e `CRON_SECRET` **não** costumam estar definidas; use valores literais na linha ou um script wrapper que exporte as variáveis e chame o `curl`.

## Observações

- Para o `next/image` carregar imagens externas, ajuste `next.config.ts` se necessário (domínios).
- O tema é via CSS Variables e pode ser editado no Admin (`site_settings.colors`).


