-- Resultado da validação do link de afiliado (após seguir o redirect e checar URL final)
alter table public.products
  add column if not exists affiliate_valid_checked_at timestamptz null,
  add column if not exists affiliate_valid boolean null;

comment on column public.products.affiliate_valid_checked_at is 'Quando o link de afiliado foi validado (seguindo o redirect)';
comment on column public.products.affiliate_valid is 'Se a URL final após redirect contém matt_tool=40141155 (true=válido, false=expirado, null=não verificado)';

create index if not exists products_affiliate_valid_idx on public.products(affiliate_valid) where affiliate_valid is not null;
