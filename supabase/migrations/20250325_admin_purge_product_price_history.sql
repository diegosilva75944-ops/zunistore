-- Purge controlado do histórico de preços (admin)
-- Execute o arquivo INTEIRO no SQL Editor (ou rode tudo de uma vez no psql).

drop function if exists public.admin_purge_product_price_history(boolean, timestamptz, timestamptz, uuid);

create or replace function public.admin_purge_product_price_history(
  p_delete_all boolean default false,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_category_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_delete_all then
    delete from public.product_price_history;
    get diagnostics n = row_count;
    return n;
  end if;

  delete from public.product_price_history h
  where (p_date_from is null or h.changed_at >= p_date_from)
    and (p_date_to is null or h.changed_at <= p_date_to)
    and (
      p_category_id is null
      or exists (
        select 1 from public.products p
        where p.id = h.product_id and p.category_id = p_category_id
      )
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Revoga de todos os papéis (PUBLIC = keyword “todos os usuários”)
revoke all on function public.admin_purge_product_price_history(boolean, timestamptz, timestamptz, uuid) from PUBLIC;

grant execute on function public.admin_purge_product_price_history(boolean, timestamptz, timestamptz, uuid) to service_role;
