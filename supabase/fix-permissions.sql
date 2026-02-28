-- ZuniStore - Corrigir permissões para o Supabase
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor)
-- Resolve: "permission denied for schema public"

-- Conceder uso do schema public às roles do Supabase
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Conceder acesso total às tabelas (service_role para admin)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Conceder leitura às tabelas públicas (anon para o site)
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.carousel_items TO anon;
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT ON public.contact_settings TO anon;
GRANT SELECT ON public.social_links TO anon;
GRANT SELECT ON public.seo_queries TO anon;

-- Garantir permissões futuras (tabelas criadas depois)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON TABLES TO service_role;
