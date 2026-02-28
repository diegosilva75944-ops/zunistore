# ZuniStore

Marketplace afiliado profissional (inspirado em grandes marketplaces), com **SEO, performance e escalabilidade** como prioridade.

Importante: o ZuniStore **não vende**. O botão **Comprar** sempre abre em **nova aba** e redireciona para o produto original usando **link afiliado**.

## Stack

- Next.js (App Router) + TypeScript
- TailwindCSS
- Supabase (PostgreSQL)
- `@supabase/supabase-js`
- Admin com autenticação própria (bcrypt) e sessão via cookie **httpOnly**
- Importação de produtos **exclusivamente via Extensão Chrome** (sem API oficial do Mercado Livre; sem scraping backend por padrão)

## Setup (Supabase)

- **1) Criar projeto no Supabase**
- **2) Aplicar schema**
  - Execute `supabase/schema.sql` no SQL Editor
- **3) Aplicar seed**
  - Execute `supabase/seed.sql` no SQL Editor

## Variáveis de ambiente

Crie um `.env.local` baseado em `.env.example`.

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

## Observações

- Para o `next/image` carregar imagens externas, ajuste `next.config.ts` se necessário (domínios).
- O tema é via CSS Variables e pode ser editado no Admin (`site_settings.colors`).


