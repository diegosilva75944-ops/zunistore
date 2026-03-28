-- Garante no máximo um slide por produto no carrossel (remove duplicatas antigas, depois índice único).

delete from public.carousel_items a
  using public.carousel_items b
 where a.product_id = b.product_id
   and a.sort_order > b.sort_order;

delete from public.carousel_items a
  using public.carousel_items b
 where a.product_id = b.product_id
   and a.id > b.id;

create unique index if not exists carousel_items_product_id_unique
  on public.carousel_items (product_id);
