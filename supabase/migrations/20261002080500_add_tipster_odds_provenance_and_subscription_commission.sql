alter table public.maurilio_tipster_tips
  add column if not exists provider_event_id text,
  add column if not exists provider_selection_key text,
  add column if not exists provider_market_key text,
  add column if not exists provider_bookmaker_key text not null default 'bet365ww',
  add column if not exists odds_captured_at timestamptz,
  add column if not exists provider_price_updated_at timestamptz,
  add column if not exists provider_capture jsonb;

alter table public.maurilio_tipster_tips
  drop constraint if exists maurilio_tipster_tips_provider_bookmaker_check;

alter table public.maurilio_tipster_tips
  add constraint maurilio_tipster_tips_provider_bookmaker_check
  check (provider_bookmaker_key in ('bet365ww','bet365'));

alter table public.maurilio_tipster_tips
  drop constraint if exists maurilio_tipster_tips_publish_before_start_check;

alter table public.maurilio_tipster_tips
  add constraint maurilio_tipster_tips_publish_before_start_check
  check (published_at < event_start_at);

create unique index if not exists maurilio_tipster_provider_pick_unique
  on public.maurilio_tipster_tips (
    tipster_id,
    provider_event_id,
    provider_selection_key,
    published_at
  )
  where provider_event_id is not null
    and provider_selection_key is not null;

alter table public.maurilio_tipster_subscriptions
  add column if not exists platform_fee_bps integer
    check (platform_fee_bps is null or (platform_fee_bps > 0 and platform_fee_bps <= 5000)),
  add column if not exists provider_plan_id text,
  add column if not exists external_reference text unique;

create table if not exists public.maurilio_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.maurilio_tipster_subscriptions(id) on delete restrict,
  provider_payment_id text not null unique,
  provider_preapproval_id text,
  status text not null check (status in ('pending','approved','rejected','refunded','cancelled')),
  gross_amount_ars numeric(12,2) not null check (gross_amount_ars > 0),
  platform_fee_bps integer not null check (platform_fee_bps > 0 and platform_fee_bps <= 5000),
  platform_fee_ars numeric(12,2) generated always as (
    round(gross_amount_ars * platform_fee_bps::numeric / 10000, 2)
  ) stored,
  tipster_net_ars numeric(12,2) generated always as (
    gross_amount_ars - round(gross_amount_ars * platform_fee_bps::numeric / 10000, 2)
  ) stored,
  paid_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maurilio_subscription_payments_subscription_idx
  on public.maurilio_subscription_payments (subscription_id, created_at desc);

alter table public.maurilio_subscription_payments enable row level security;
revoke all on table public.maurilio_subscription_payments from anon, authenticated;

create or replace view public.maurilio_tipster_revenue_summary
with (security_invoker = false)
as
select
  s.tipster_id,
  count(p.id) filter (where p.status = 'approved')::int as approved_charges,
  coalesce(sum(p.gross_amount_ars) filter (where p.status = 'approved'),0)::numeric(14,2) as gross_ars,
  coalesce(sum(p.platform_fee_ars) filter (where p.status = 'approved'),0)::numeric(14,2) as platform_fee_ars,
  coalesce(sum(p.tipster_net_ars) filter (where p.status = 'approved'),0)::numeric(14,2) as tipster_net_ars
from public.maurilio_tipster_subscriptions s
left join public.maurilio_subscription_payments p on p.subscription_id = s.id
group by s.tipster_id;

revoke all on table public.maurilio_tipster_revenue_summary from anon, authenticated;

create or replace function public.maurilio_tipster_tip_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'published_tip_is_immutable';
  end if;

  if old.tipster_id is distinct from new.tipster_id
    or old.public_id is distinct from new.public_id
    or old.sport is distinct from new.sport
    or old.competition is distinct from new.competition
    or old.event is distinct from new.event
    or old.market is distinct from new.market
    or old.selection is distinct from new.selection
    or old.bookmaker is distinct from new.bookmaker
    or old.entry_odds is distinct from new.entry_odds
    or old.stake_units is distinct from new.stake_units
    or old.event_start_at is distinct from new.event_start_at
    or old.published_at is distinct from new.published_at
    or old.content_hash is distinct from new.content_hash
    or old.provider_event_id is distinct from new.provider_event_id
    or old.provider_selection_key is distinct from new.provider_selection_key
    or old.provider_market_key is distinct from new.provider_market_key
    or old.provider_bookmaker_key is distinct from new.provider_bookmaker_key
    or old.odds_captured_at is distinct from new.odds_captured_at
    or old.provider_price_updated_at is distinct from new.provider_price_updated_at
    or old.provider_capture is distinct from new.provider_capture
  then
    raise exception 'published_tip_core_fields_are_immutable';
  end if;

  if old.status = 'settled' and (
    old.status is distinct from new.status
    or old.result is distinct from new.result
    or old.closing_odds is distinct from new.closing_odds
    or old.settled_at is distinct from new.settled_at
  ) then
    raise exception 'settled_tip_is_immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
