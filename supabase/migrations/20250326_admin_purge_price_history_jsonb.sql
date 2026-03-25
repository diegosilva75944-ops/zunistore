-- PostgREST: RPC com vários args nomeados costuma gerar PGRST202; uma única
-- função (payload jsonb) é resolvida de forma estável.

-- Quem já tinha a versão antiga (4 argumentos) precisa desta migração.
drop function if exists public.admin_purge_product_price_history(boolean, timestamptz, timestamptz, uuid);

create or replace function public.admin_purge_product_price_history(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  p_delete_all boolean;
  p_date_from timestamptz;
  p_date_to timestamptz;
  p_category_id uuid;
begin
  p_delete_all := coalesce((payload->>'p_delete_all')::boolean, false);
  p_date_from := (payload->>'p_date_from')::timestamptz;
  p_date_to := (payload->>'p_date_to')::timestamptz;

  if (payload->>'p_category_id') is not null and (payload->>'p_category_id') <> '' then
    p_category_id := (payload->>'p_category_id')::uuid;
  else
    p_category_id := null;
  end if;

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

revoke all on function public.admin_purge_product_price_history(jsonb) from PUBLIC;
grant execute on function public.admin_purge_product_price_history(jsonb) to service_role;

-- Recarrega o cache de schema do PostgREST (se disponível)
notify pgrst, 'reload schema';
