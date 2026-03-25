-- Descrição longa do bloco ML (#description .ui-pdp-description__content), além da description curta (JSON-LD).
alter table public.products add column if not exists description_detail text not null default '';
