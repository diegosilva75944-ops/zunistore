-- Grants/policies para permitir escrita via service_role (backend).
-- Em alguns setups (tabela criada manualmente), o role service_role pode não ter privileges explícitos.

-- Garantir privileges para service_role (backend-only).
grant select, insert, update, delete on table public.mercadolivre_tokens to service_role;

-- Mantém RLS habilitado; service_role normalmente bypassa RLS no Supabase,
-- mas a policy abaixo ajuda em ambientes onde o bypass não ocorre.
do $$ begin
  create policy "service_role manage mercadolivre_tokens"
  on public.mercadolivre_tokens
  for all
  to service_role
  using (true)
  with check (true);
exception when duplicate_object then null; end $$;

