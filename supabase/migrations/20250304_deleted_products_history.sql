-- Histórico de produtos removidos (ex.: não encontrado na URL na sincronização)
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
