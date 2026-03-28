-- Categorias importadas: controle de exibição no cabeçalho (default oculto).
alter table public.categories
  add column if not exists show_in_header boolean not null default false;

-- Seeds raiz: aparecem no header por padrão.
update public.categories
set show_in_header = true
where is_seed = true and parent_id is null;

-- Posição da seção "Produtos em oferta" na home (tema / layout).
alter table public.site_settings
  add column if not exists offers_section_position text not null default 'after_hero';

comment on column public.site_settings.offers_section_position is 'after_hero | before_hero — ordem em relação ao carrossel na página inicial.';
