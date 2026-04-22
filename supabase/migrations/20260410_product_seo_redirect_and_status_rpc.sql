-- SEO PDP: substituto (301) + RPC público para middleware/página (410, slug canónico, etc.)

alter table public.products
  add column if not exists redirect_code6 text null,
  add column if not exists redirect_slug text null;

comment on column public.products.redirect_code6 is 'Substituto: code6 do produto destino (301 permanente na PDP).';
comment on column public.products.redirect_slug is 'Substituto: slug do produto destino (301 permanente na PDP).';

create index if not exists products_redirect_code6_idx on public.products (redirect_code6)
  where redirect_code6 is not null;

-- RPC leve para Edge/middleware: sem expor linhas inteiras de deleted_products_history.
create or replace function public.product_page_status(p_code6 text, p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pr record;
  dh boolean;
begin
  if p_code6 is null or length(trim(p_code6)) = 0 then
    return jsonb_build_object('kind', 'missing');
  end if;

  select
    p.slug,
    p.is_active,
    p.redirect_code6,
    p.redirect_slug
  into pr
  from public.products p
  where p.code6 = p_code6
  limit 1;

  if found then
    if pr.slug is distinct from p_slug then
      return jsonb_build_object(
        'kind', 'slug_mismatch',
        'canonical_slug', pr.slug
      );
    end if;
    if coalesce(trim(pr.redirect_code6), '') <> '' and coalesce(trim(pr.redirect_slug), '') <> '' then
      return jsonb_build_object(
        'kind', 'redirect',
        'target_code6', trim(pr.redirect_code6),
        'target_slug', trim(pr.redirect_slug)
      );
    end if;
    if pr.is_active is false then
      return jsonb_build_object('kind', 'inactive');
    end if;
    return jsonb_build_object('kind', 'active');
  end if;

  select exists(
    select 1
    from public.deleted_products_history d
    where d.code6 = p_code6
      and d.slug = p_slug
    limit 1
  ) into dh;

  if dh then
    return jsonb_build_object('kind', 'gone');
  end if;

  return jsonb_build_object('kind', 'missing');
end;
$$;

grant execute on function public.product_page_status(text, text) to anon, authenticated, service_role;
