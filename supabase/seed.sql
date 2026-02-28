-- ZuniStore - Seed inicial

-- Admin user: admin / Diego6412@
insert into public.admin_users (username, password_hash)
values ('admin', '$2b$12$DBwYHdQYUi.9TF93Fm5kT.omiJG2/F.Z1/ilSEOqe8mIzjoDvxq/u')
on conflict (username) do update set password_hash = excluded.password_hash;

-- Site settings (tema roxo padrão)
insert into public.site_settings (logo_url, colors)
select
  null,
  jsonb_build_object(
    '--zuni-primary', '#6D28D9',
    '--zuni-purple-dark', '#4C1D95',
    '--zuni-purple-light', '#EDE9FE',
    '--zuni-green', '#22C55E',
    '--zuni-yellow', '#FACC15',
    '--zuni-red', '#EF4444',
    '--zuni-orange', '#F97316',
    '--zuni-black', '#0B0B0F',
    '--zuni-white', '#FFFFFF',
    '--background', '#FFFFFF',
    '--foreground', '#0B0B0F',
    '--header-bg', '#4C1D95',
    '--card-bg', '#FFFFFF',
    '--muted', '#6B7280'
  )
where not exists (select 1 from public.site_settings);

-- Contact settings (linha única)
insert into public.contact_settings (address, city, state, phone, email)
select null, null, null, null, null
where not exists (select 1 from public.contact_settings);

-- Seed categories (multi-nicho)
with seed(name, slug) as (
  values
    ('Casa e Decoração', 'casa-e-decoracao'),
    ('Moda e Calçados', 'moda-e-calcados'),
    ('Beleza e Cuidado Pessoal', 'beleza-e-cuidado-pessoal'),
    ('Eletrônicos e Áudio', 'eletronicos-e-audio'),
    ('Celulares e Acessórios', 'celulares-e-acessorios'),
    ('Informática e Acessórios', 'informatica-e-acessorios'),
    ('Eletrodomésticos', 'eletrodomesticos'),
    ('Esportes e Fitness', 'esportes-e-fitness'),
    ('Acessórios para Veículos', 'acessorios-para-veiculos'),
    ('Saúde e Suplementos', 'saude-e-suplementos')
)
insert into public.categories (name, slug, parent_id, is_seed)
select s.name, s.slug, null, true
from seed s
on conflict (slug) do nothing;

