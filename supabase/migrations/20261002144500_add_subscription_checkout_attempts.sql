
create table if not exists public.maurilio_subscription_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.maurilio_tipster_subscriptions(id) on delete cascade,
  external_reference text not null unique,
  provider_checkout_id text,
  provider_collector_id text not null,
  gross_amount_ars numeric(14,2) not null check (gross_amount_ars > 0),
  platform_fee_bps integer not null check (platform_fee_bps between 1 and 5000),
  marketplace_fee_ars numeric(14,2) not null check (marketplace_fee_ars > 0),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled','expired')),
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.maurilio_subscription_checkout_attempts enable row level security;
revoke all on table public.maurilio_subscription_checkout_attempts from anon, authenticated;

create index if not exists maurilio_checkout_attempts_subscription_idx
  on public.maurilio_subscription_checkout_attempts (subscription_id, created_at desc);

create index if not exists maurilio_checkout_attempts_provider_idx
  on public.maurilio_subscription_checkout_attempts (provider_checkout_id)
  where provider_checkout_id is not null;
