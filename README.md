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
5. Criar job de cron no Coolify chamando `GET /api/cron/sync-prices` (sem autenticação)

## Observações

- Para o `next/image` carregar imagens externas, ajuste `next.config.ts` se necessário (domínios).
- O tema é via CSS Variables e pode ser editado no Admin (`site_settings.colors`).


