-- Personalização de vitrine: sessões, eventos, popularidade diária.
-- Acesso via PostgREST com service_role (APIs Next.js); sem grants para anon nas tabelas sensíveis.

-- ---------------------------------------------------------------------------
-- Sessões (visitante ou futuro usuário logado)
-- ---------------------------------------------------------------------------
create table if not exists public.personalization_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personalization_sessions_user_id_idx
  on public.personalization_sessions (user_id)
  where user_id is not null;

create trigger set_personalization_sessions_updated_at
before update on public.personalization_sessions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------
create table if not exists public.user_search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  session_id text null,
  term text not null,
  normalized_term text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_search_events_session_created_idx
  on public.user_search_events (session_id, created_at desc);
create index if not exists user_search_events_user_created_idx
  on public.user_search_events (user_id, created_at desc)
  where user_id is not null;
create index if not exists user_search_events_normalized_term_idx
  on public.user_search_events (normalized_term);

create table if not exists public.user_product_click_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  session_id text null,
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid null references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists user_product_click_session_created_idx
  on public.user_product_click_events (session_id, created_at desc);
create index if not exists user_product_click_user_created_idx
  on public.user_product_click_events (user_id, created_at desc)
  where user_id is not null;
create index if not exists user_product_click_product_idx
  on public.user_product_click_events (product_id, created_at desc);
create index if not exists user_product_click_category_idx
  on public.user_product_click_events (category_id, created_at desc)
  where category_id is not null;

create table if not exists public.user_product_view_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  session_id text null,
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid null references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists user_product_view_session_created_idx
  on public.user_product_view_events (session_id, created_at desc);
create index if not exists user_product_view_user_created_idx
  on public.user_product_view_events (user_id, created_at desc)
  where user_id is not null;
create index if not exists user_product_view_product_idx
  on public.user_product_view_events (product_id, created_at desc);

create table if not exists public.user_category_visit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  session_id text null,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists user_category_visit_session_created_idx
  on public.user_category_visit_events (session_id, created_at desc);
create index if not exists user_category_visit_category_idx
  on public.user_category_visit_events (category_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Popularidade agregada (diária, UTC)
-- ---------------------------------------------------------------------------
create table if not exists public.product_popularity_daily (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  ref_date date not null,
  search_score int not null default 0,
  click_score int not null default 0,
  view_score int not null default 0,
  total_score int generated always as (search_score + click_score + view_score) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, ref_date)
);

create index if not exists product_popularity_daily_ref_total_idx
  on public.product_popularity_daily (ref_date, total_score desc);

create trigger set_product_popularity_daily_updated_at
before update on public.product_popularity_daily
for each row execute function public.set_updated_at();

create table if not exists public.category_popularity_daily (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  ref_date date not null,
  visit_score int not null default 0,
  total_score int generated always as (visit_score) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, ref_date)
);

create index if not exists category_popularity_daily_ref_total_idx
  on public.category_popularity_daily (ref_date, total_score desc);

create trigger set_category_popularity_daily_updated_at
before update on public.category_popularity_daily
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: incrementos atômicos (chamado pela API Next com service_role)
-- ---------------------------------------------------------------------------
create or replace function public.personalization_upsert_session(p_session_id text, p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.personalization_sessions (session_id, user_id)
  values (p_session_id, p_user_id)
  on conflict (session_id) do update set
    user_id = coalesce(excluded.user_id, public.personalization_sessions.user_id),
    updated_at = now();
end;
$$;

create or replace function public.personalization_bump_product_day(
  p_product_id uuid,
  p_search_delta int default 0,
  p_click_delta int default 0,
  p_view_delta int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone('utc', now()))::date;
begin
  if p_search_delta = 0 and p_click_delta = 0 and p_view_delta = 0 then
    return;
  end if;
  insert into public.product_popularity_daily (product_id, ref_date, search_score, click_score, view_score)
  values (p_product_id, d, greatest(0, p_search_delta), greatest(0, p_click_delta), greatest(0, p_view_delta))
  on conflict (product_id, ref_date) do update set
    search_score = public.product_popularity_daily.search_score + greatest(0, p_search_delta),
    click_score = public.product_popularity_daily.click_score + greatest(0, p_click_delta),
    view_score = public.product_popularity_daily.view_score + greatest(0, p_view_delta),
    updated_at = now();
end;
$$;

create or replace function public.personalization_bump_category_day(
  p_category_id uuid,
  p_visit_delta int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone('utc', now()))::date;
begin
  if p_visit_delta <= 0 then
    return;
  end if;
  insert into public.category_popularity_daily (category_id, ref_date, visit_score)
  values (p_category_id, d, p_visit_delta)
  on conflict (category_id, ref_date) do update set
    visit_score = public.category_popularity_daily.visit_score + p_visit_delta,
    updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: bloquear acesso direto anon/authenticated; service_role ignora RLS no Supabase
-- ---------------------------------------------------------------------------
alter table public.personalization_sessions enable row level security;
alter table public.user_search_events enable row level security;
alter table public.user_product_click_events enable row level security;
alter table public.user_product_view_events enable row level security;
alter table public.user_category_visit_events enable row level security;
alter table public.product_popularity_daily enable row level security;
alter table public.category_popularity_daily enable row level security;

-- ---------------------------------------------------------------------------
-- Grants (menor privilégio: apenas service_role; sem anon/authenticated nas tabelas novas)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.personalization_sessions to service_role;
grant select, insert, update, delete on public.user_search_events to service_role;
grant select, insert, update, delete on public.user_product_click_events to service_role;
grant select, insert, update, delete on public.user_product_view_events to service_role;
grant select, insert, update, delete on public.user_category_visit_events to service_role;
grant select, insert, update, delete on public.product_popularity_daily to service_role;
grant select, insert, update, delete on public.category_popularity_daily to service_role;

grant execute on function public.personalization_upsert_session(text, uuid) to service_role;
grant execute on function public.personalization_bump_product_day(uuid, int, int, int) to service_role;
grant execute on function public.personalization_bump_category_day(uuid, int) to service_role;

do $$ begin
  create policy "service_role personalization_sessions"
  on public.personalization_sessions for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "service_role user_search_events"
  on public.user_search_events for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "service_role user_product_click_events"
  on public.user_product_click_events for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "service_role user_product_view_events"
  on public.user_product_view_events for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "service_role user_category_visit_events"
  on public.user_category_visit_events for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "service_role product_popularity_daily"
  on public.product_popularity_daily for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "service_role category_popularity_daily"
  on public.category_popularity_daily for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
