-- Histórico de alteração de preço
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
