create table if not exists public.maurilio_tipster_payment_accounts (
  tipster_id uuid primary key references public.maurilio_tipsters(id) on delete cascade,
  provider text not null default 'mercado_pago' check (provider = 'mercado_pago'),
  provider_user_id text not null,
  public_key text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  scope text,
  live_mode boolean not null default false,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.maurilio_tipster_payment_accounts enable row level security;
revoke all on table public.maurilio_tipster_payment_accounts from anon, authenticated;

create unique index if not exists maurilio_tipster_payment_accounts_provider_user_idx
  on public.maurilio_tipster_payment_accounts (provider, provider_user_id)
  where revoked_at is null;

create table if not exists public.maurilio_payment_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipster_id uuid not null references public.maurilio_tipsters(id) on delete cascade,
  provider text not null default 'mercado_pago' check (provider = 'mercado_pago'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.maurilio_payment_oauth_states enable row level security;
revoke all on table public.maurilio_payment_oauth_states from anon, authenticated;

create index if not exists maurilio_payment_oauth_states_expiry_idx
  on public.maurilio_payment_oauth_states (expires_at);

alter table public.maurilio_tipster_subscriptions
  add column if not exists renewal_mode text not null default 'manual'
    check (renewal_mode in ('manual','legacy_recurring')),
  add column if not exists provider_checkout_id text,
  add column if not exists provider_collector_id text,
  add column if not exists access_period_days integer not null default 30
    check (access_period_days between 1 and 366);

alter table public.maurilio_subscription_payments
  add column if not exists provider_collector_id text,
  add column if not exists provider_marketplace_fee_ars numeric(14,2);

create index if not exists maurilio_tipster_subscriptions_checkout_idx
  on public.maurilio_tipster_subscriptions (provider_checkout_id)
  where provider_checkout_id is not null;

create index if not exists maurilio_subscription_payments_collector_idx
  on public.maurilio_subscription_payments (provider_collector_id);
