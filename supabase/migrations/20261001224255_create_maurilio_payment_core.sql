create table if not exists public.maurilio_matchdays (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  match_date date not null,
  label text not null,
  status text not null default 'draft'
    check (status in ('draft','published','settled','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maurilio_picks (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references public.maurilio_matchdays(id) on delete cascade,
  public_id text not null unique,
  tier text not null check (tier in ('free','pro','elite')),
  sport text not null default 'football',
  competition text not null,
  event text not null,
  market text not null,
  selection text,
  bookmaker text not null default 'Bet365' check (bookmaker = 'Bet365'),
  entry_odds numeric(10,4) check (entry_odds is null or entry_odds > 1),
  minimum_odds numeric(10,4) check (minimum_odds is null or minimum_odds > 1),
  probability_own numeric(6,5) check (probability_own is null or probability_own between 0 and 1),
  probability_low numeric(6,5) check (probability_low is null or probability_low between 0 and 1),
  probability_high numeric(6,5) check (probability_high is null or probability_high between 0 and 1),
  stake_pct numeric(6,5) check (stake_pct is null or stake_pct between 0 and 0.02),
  thesis text,
  principal_risk text,
  odds_captured_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','published','void','settled')),
  result text check (result is null or result in ('win','loss','push','void')),
  closing_odds numeric(10,4) check (closing_odds is null or closing_odds > 1),
  pnl_ars numeric(14,2),
  published_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (probability_low is null or probability_high is null or probability_low <= probability_high),
  check (probability_own is null or probability_low is null or probability_own >= probability_low),
  check (probability_own is null or probability_high is null or probability_own <= probability_high)
);

create index if not exists maurilio_picks_matchday_tier_idx
  on public.maurilio_picks(matchday_id, tier);

create table if not exists public.maurilio_orders (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercado_pago' check (provider = 'mercado_pago'),
  provider_order_id text unique,
  external_reference text not null unique,
  subject_id uuid not null,
  matchday_slug text not null,
  tier text not null check (tier in ('pro','elite')),
  amount_ars numeric(14,2) not null check (amount_ars > 0),
  status text not null default 'created'
    check (status in ('created','pending','processed','paid','cancelled','refunded','failed')),
  live_mode boolean,
  checkout_url text,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists maurilio_orders_subject_idx
  on public.maurilio_orders(subject_id, matchday_slug, tier);
create index if not exists maurilio_orders_provider_idx
  on public.maurilio_orders(provider_order_id);

create table if not exists public.maurilio_entitlements (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  matchday_slug text not null,
  tier text not null check (tier in ('pro','elite')),
  source_order_id uuid not null references public.maurilio_orders(id) on delete restrict,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(subject_id, matchday_slug, tier)
);

create index if not exists maurilio_entitlements_subject_idx
  on public.maurilio_entitlements(subject_id, matchday_slug, status);

create table if not exists public.maurilio_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercado_pago' check (provider = 'mercado_pago'),
  provider_event_id text not null unique,
  provider_order_id text,
  action text,
  event_type text,
  request_id text,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received','verified','processed','ignored','failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.maurilio_matchdays enable row level security;
alter table public.maurilio_picks enable row level security;
alter table public.maurilio_orders enable row level security;
alter table public.maurilio_entitlements enable row level security;
alter table public.maurilio_webhook_events enable row level security;

revoke all on table public.maurilio_matchdays from anon, authenticated;
revoke all on table public.maurilio_picks from anon, authenticated;
revoke all on table public.maurilio_orders from anon, authenticated;
revoke all on table public.maurilio_entitlements from anon, authenticated;
revoke all on table public.maurilio_webhook_events from anon, authenticated;

grant select, insert, update, delete on table public.maurilio_matchdays to service_role;
grant select, insert, update, delete on table public.maurilio_picks to service_role;
grant select, insert, update, delete on table public.maurilio_orders to service_role;
grant select, insert, update, delete on table public.maurilio_entitlements to service_role;
grant select, insert, update, delete on table public.maurilio_webhook_events to service_role;
