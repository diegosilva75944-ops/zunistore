-- Produtos importados de anúncios públicos (Mercado Livre) sem credenciais.
-- Mantém compatibilidade: catálogo continua lendo `public.products`.

create table if not exists public.product_external_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,

  -- Identificação / origem
  origin text not null default 'mercadolivre',
  origin_tipo text not null default 'public_listing',
  external_id text not null, -- ex: MLB123456789
  external_permalink text not null,
  seller_id text null,
  seller_nickname text null,
  external_category_id text null,
  external_category_name text null,

  -- Preço (snapshot externo; o catálogo usa products.price/promo_price)
  external_currency text null,
  external_price_current numeric null,
  external_price_original numeric null,
  external_is_promo boolean null,
  external_discount_percent int null,

  -- Conteúdo (snapshot externo; o catálogo usa products.*)
  external_brand text null,
  external_model text null,
  external_gtin text null,
  external_attributes jsonb null,
  external_payload jsonb null,

  -- Mídia (snapshot externo; o catálogo usa products.images)
  external_thumbnail text null,
  external_main_image text null,
  external_images jsonb null,

  -- Controle
  imported_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  import_mode text not null default 'admin_internal', -- admin_internal | extension | other
  external_status text null, -- active/paused/closed/etc (como vier da API pública)
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

-- RLS: não expor metadados externos publicamente por padrão.
alter table public.product_external_listings enable row level security;

-- Controle interno de exibição no catálogo (não quebra existentes: default true).
alter table public.products
  add column if not exists is_active boolean not null default true;

create index if not exists products_is_active_idx on public.products(is_active) where is_active = true;

