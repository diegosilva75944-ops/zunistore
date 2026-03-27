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
  description_detail text not null default '',
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
  affiliate_valid_checked_at timestamptz null,
  affiliate_valid boolean null,
  is_active boolean not null default true,
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
create index if not exists products_is_active_idx on public.products(is_active) where is_active = true;

create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- Vínculo de produtos importados por fontes externas (ex.: Mercado Livre público)
create table if not exists public.product_external_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,

  origin text not null default 'mercadolivre',
  origin_tipo text not null default 'public_listing',
  external_id text not null,
  external_permalink text not null,
  seller_id text null,
  seller_nickname text null,
  external_category_id text null,
  external_category_name text null,

  external_currency text null,
  external_price_current numeric null,
  external_price_original numeric null,
  external_is_promo boolean null,
  external_discount_percent int null,

  external_brand text null,
  external_model text null,
  external_gtin text null,
  external_attributes jsonb null,
  external_payload jsonb null,

  external_thumbnail text null,
  external_main_image text null,
  external_images jsonb null,

  imported_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  import_mode text not null default 'admin_internal',
  external_status text null,
  external_active boolean not null default true
);

create unique index if not exists product_external_listings_external_id_uq
  on public.product_external_listings(origin, external_id);

create unique index if not exists product_external_listings_permalink_uq
  on public.product_external_listings(origin, external_permalink);

create index if not exists product_external_listings_product_id_idx
  on public.product_external_listings(product_id);

create index if not exists product_external_listings_seller_id_idx
  on public.product_external_listings(seller_id);

create index if not exists product_external_listings_seller_nickname_idx
  on public.product_external_listings(seller_nickname);

-- histórico de produtos removidos (ex.: não encontrado na URL na sincronização)
create table if not exists public.deleted_products_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  code6 text not null,
  slug text not null,
  title text not null,
  description text not null default '',
  images jsonb not null default '[]'::jsonb,
  category_id uuid null,
  category_name text null,
  price numeric not null,
  promo_price numeric null,
  is_offer boolean not null default false,
  off_percent int not null default 0,
  affiliate_url text not null,
  source_url text null,
  deleted_at timestamptz not null default now(),
  reason text not null default 'sync_not_found'
);

create index if not exists deleted_products_history_deleted_at_idx on public.deleted_products_history(deleted_at desc);

-- histórico de alteração de preço (para alertar quando produto teve preço alterado)
create table if not exists public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  old_price numeric not null,
  new_price numeric not null,
  old_promo_price numeric null,
  new_promo_price numeric null,
  changed_at timestamptz not null default now(),
  source text not null default 'sync'
);

create index if not exists product_price_history_changed_at_idx on public.product_price_history(changed_at desc);
create index if not exists product_price_history_product_id_idx on public.product_price_history(product_id);

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

-- Mercado Livre OAuth tokens (integração oficial)
create table if not exists public.mercadolivre_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'bearer',
  scope text null,
  expires_in int not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mercadolivre_tokens_expires_at_idx on public.mercadolivre_tokens(expires_at);

create trigger set_mercadolivre_tokens_updated_at
before update on public.mercadolivre_tokens
for each row execute function public.set_updated_at();

-- OAuth state (CSRF) do Mercado Livre, com expiração e uso único
create table if not exists public.mercadolivre_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null
);

create index if not exists mercadolivre_oauth_states_expires_at_idx on public.mercadolivre_oauth_states(expires_at);

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
alter table public.product_external_listings enable row level security;
alter table public.carousel_items enable row level security;
alter table public.site_settings enable row level security;
alter table public.contact_settings enable row level security;
alter table public.social_links enable row level security;
alter table public.seo_queries enable row level security;
alter table public.mercadolivre_tokens enable row level security;
alter table public.mercadolivre_oauth_states enable row level security;

-- Grants/policies para tokens sensíveis (backend via service_role)
grant select, insert, update, delete on table public.mercadolivre_tokens to service_role;
do $$ begin
  create policy "service_role manage mercadolivre_tokens"
  on public.mercadolivre_tokens
  for all
  to service_role
  using (true)
  with check (true);
exception when duplicate_object then null; end $$;

-- Metadados externos: sem política, RLS bloqueia INSERT/UPSERT mesmo com service_role em alguns PostgREST.
grant select, insert, update, delete on table public.product_external_listings to service_role;
do $$ begin
  create policy "service_role manage product_external_listings"
  on public.product_external_listings
  for all
  to service_role
  using (true)
  with check (true);
exception when duplicate_object then null; end $$;

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

