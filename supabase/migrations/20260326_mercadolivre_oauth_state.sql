-- OAuth state (CSRF) do Mercado Livre, com expiração e uso único
create table if not exists public.mercadolivre_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null
);

create index if not exists mercadolivre_oauth_states_expires_at_idx on public.mercadolivre_oauth_states(expires_at);

alter table public.mercadolivre_oauth_states enable row level security;

