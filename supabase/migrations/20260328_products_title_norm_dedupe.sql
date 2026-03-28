-- Título normalizado para deduplicação (import/sync) + função que lista IDs duplicados a remover.

alter table public.products
  add column if not exists title_norm text
  generated always as (lower(trim(regexp_replace(title, '\s+', ' ', 'g')))) stored;

create index if not exists products_title_norm_idx on public.products (title_norm);

-- Mantém um produto por title_norm: prioriza quem tem vínculo ML, depois menor code6, depois mais antigo.
create or replace function public.dedupe_product_ids_duplicate_title_norm()
returns table (id uuid)
language sql
stable
as $$
  with ranked as (
    select
      p.id as pid,
      row_number() over (
        partition by p.title_norm
        order by
          (select count(*)::int from public.product_external_listings pel
           where pel.product_id = p.id and pel.origin = 'mercadolivre') desc,
          p.code6 asc,
          p.created_at asc
      ) as rn
    from public.products p
  )
  select pid from ranked where rn > 1;
$$;

grant execute on function public.dedupe_product_ids_duplicate_title_norm() to service_role;
