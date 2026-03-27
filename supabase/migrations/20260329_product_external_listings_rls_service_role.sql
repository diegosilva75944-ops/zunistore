-- RLS em product_external_listings estava ativo sem política → INSERT/UPSERT via API retornava 403 (42501).
grant select, insert, update, delete on table public.product_external_listings to service_role;

drop policy if exists "service_role manage product_external_listings" on public.product_external_listings;

create policy "service_role manage product_external_listings"
  on public.product_external_listings
  for all
  to service_role
  using (true)
  with check (true);
