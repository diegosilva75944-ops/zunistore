-- ZuniStore (Supabase/Postgres) - Schema
-- Aplicar no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid null references public.categories(id) on delete set null,
  is_seed boolean not null default false,
  created_at timestamptz not null default now()
);

-- products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code6 text not null unique,
  slug text not null,
  title text not null,
  description text not null default '',
  images jsonb not null default '[]'::jsonb,
  category_id uuid not null references public.categories(id) on delete restrict,
  price numeric not null,
  promo_price numeric null,
  is_offer boolean not null default false,
  off_percent int not null default 0,
  rating numeric null,
  reviews_count int null,
  affiliate_code text not null,
  affiliate_url text not null,
  source_url text not null,
  needs_update boolean not null default false,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(description,''))
  ) stored,
  effective_price numeric generated always as (coalesce(promo_price, price)) stored
);

create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_created_at_idx on public.products(created_at desc);
create index if not exists products_effective_price_idx on public.products(effective_price);
create index if not exists products_offer_idx on public.products(is_offer);
create index if not exists products_off_percent_idx on public.products(off_percent desc);
create index if not exists products_search_tsv_idx on public.products using gin(search_tsv);

create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- carousel
create table if not exists public.carousel_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order int not null default 0,
  size text not null default 'M' check (size in ('S','M','G'))
);

create index if not exists carousel_sort_idx on public.carousel_items(sort_order asc);

-- site settings (1 linha)
create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  logo_url text null,
  colors jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

-- contact settings (1 linha)
create table if not exists public.contact_settings (
  id uuid primary key default gen_random_uuid(),
  address text null,
  city text null,
  state text null,
  phone text null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_contact_settings_updated_at
before update on public.contact_settings
for each row execute function public.set_updated_at();

-- social links
create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  icon text not null,
  url text not null,
  color text null,
  sort_order int not null default 0
);

-- admin users
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null
);

-- extension/admin tokens
create table if not exists public.admin_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null,
  active boolean not null default true,
  last_used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists admin_tokens_hash_idx on public.admin_tokens(token_hash);

-- counters
create table if not exists public.counters (
  id text primary key,
  value int not null default 0
);

create or replace function public.next_product_code6()
returns text
language plpgsql
as $$
declare new_value int;
begin
  insert into public.counters(id, value)
  values ('product_code6', 1)
  on conflict (id)
  do update set value = public.counters.value + 1
  returning value into new_value;

  return lpad(new_value::text, 6, '0');
end;
$$;

-- SEO programático (buscas indexáveis controladas)
create table if not exists public.seo_queries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  query_terms jsonb not null default '[]'::jsonb,
  category_id uuid null references public.categories(id) on delete set null,
  is_indexable boolean not null default false,
  min_results int not null default 8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_seo_queries_updated_at
before update on public.seo_queries
for each row execute function public.set_updated_at();

-- Helper RPC: conta resultados por termos (FTS)
create or replace function public.count_products_for_terms(_terms text[], _category uuid default null)
returns int
language sql
stable
as $$
  select count(*)::int
  from public.products p
  where (_category is null or p.category_id = _category)
    and (
      array_length(_terms, 1) is null
      or (
        p.search_tsv @@ websearch_to_tsquery('portuguese', array_to_string(_terms, ' '))
      )
    );
$$;

-- RLS (leitura pública apenas nas tabelas públicas)
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.carousel_items enable row level security;
alter table public.site_settings enable row level security;
alter table public.contact_settings enable row level security;
alter table public.social_links enable row level security;
alter table public.seo_queries enable row level security;

do $$ begin
  create policy "public read categories" on public.categories for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read products" on public.products for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read carousel" on public.carousel_items for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read site_settings" on public.site_settings for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read contact_settings" on public.contact_settings for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read social_links" on public.social_links for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read seo_queries" on public.seo_queries for select using (true);
exception when duplicate_object then null; end $$;

-- Caso você já tenha criado a tabela antes desta versão do schema.sql,
-- aplique também estes ALTERs (idempotentes) para manter compatibilidade:
alter table public.products
  add column if not exists effective_price numeric generated always as (coalesce(promo_price, price)) stored;
create index if not exists products_effective_price_idx on public.products(effective_price);

