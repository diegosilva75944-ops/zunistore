-- Tokens OAuth do Mercado Livre (integração oficial)
create table if not exists public.mercadolivre_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'bearer',
  scope text null,
  expires_in int not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mercadolivre_tokens_expires_at_idx on public.mercadolivre_tokens(expires_at);

create trigger set_mercadolivre_tokens_updated_at
before update on public.mercadolivre_tokens
for each row execute function public.set_updated_at();

alter table public.mercadolivre_tokens enable row level security;

