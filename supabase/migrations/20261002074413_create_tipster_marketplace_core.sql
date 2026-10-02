create extension if not exists pgcrypto;

create table if not exists public.maurilio_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','tipster','admin')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maurilio_tipsters (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid unique references auth.users(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  display_name text not null check (char_length(display_name) between 2 and 60),
  avatar_url text,
  headline text check (headline is null or char_length(headline) <= 120),
  bio text check (bio is null or char_length(bio) <= 1000),
  sports text[] not null default '{}',
  specialties text[] not null default '{}',
  monthly_price_ars numeric(12,2) check (monthly_price_ars is null or monthly_price_ars >= 0),
  currency text not null default 'ARS',
  is_verified boolean not null default false,
  accepting_subscribers boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maurilio_tipster_tips (
  id uuid primary key default gen_random_uuid(),
  tipster_id uuid not null references public.maurilio_tipsters(id) on delete restrict,
  public_id text not null unique,
  sport text not null,
  competition text not null,
  event text not null,
  market text not null,
  selection text not null,
  bookmaker text not null default 'Bet365' check (bookmaker = 'Bet365'),
  entry_odds numeric(8,3) not null check (entry_odds > 1),
  closing_odds numeric(8,3) check (closing_odds is null or closing_odds > 1),
  stake_units numeric(6,2) not null check (stake_units > 0 and stake_units <= 5),
  event_start_at timestamptz not null,
  published_at timestamptz not null default now(),
  settled_at timestamptz,
  result text check (result is null or result in ('win','loss','push','void')),
  status text not null default 'published' check (status in ('published','settled')),
  content_hash text not null default '',
  profit_units numeric(10,4) generated always as (
    case
      when result = 'win' then stake_units * (entry_odds - 1)
      when result = 'loss' then -stake_units
      when result in ('push','void') then 0
      else null
    end
  ) stored,
  clv_pct numeric(10,4) generated always as (
    case
      when closing_odds is not null then ((entry_odds / closing_odds) - 1) * 100
      else null
    end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'published' and result is null and settled_at is null)
    or
    (status = 'settled' and result is not null and settled_at is not null)
  )
);

create index if not exists maurilio_tipster_tips_tipster_settled_idx
  on public.maurilio_tipster_tips (tipster_id, settled_at desc)
  where status = 'settled';

create index if not exists maurilio_tipster_tips_open_idx
  on public.maurilio_tipster_tips (tipster_id, event_start_at)
  where status = 'published';

create table if not exists public.maurilio_tipster_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscriber_user_id uuid not null references auth.users(id) on delete cascade,
  tipster_id uuid not null references public.maurilio_tipsters(id) on delete restrict,
  status text not null default 'active' check (status in ('active','past_due','cancelled','expired')),
  monthly_price_ars numeric(12,2) not null check (monthly_price_ars >= 0),
  provider text not null default 'mercado_pago',
  provider_subscription_id text,
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists maurilio_tipster_subscriptions_active_unique
  on public.maurilio_tipster_subscriptions (subscriber_user_id, tipster_id)
  where status in ('active','past_due');

create table if not exists public.maurilio_tipster_promotions (
  id uuid primary key default gen_random_uuid(),
  tipster_id uuid not null references public.maurilio_tipsters(id) on delete restrict,
  placement text not null default 'search_top' check (placement in ('search_top')),
  status text not null default 'draft' check (status in ('draft','pending','active','expired','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  amount_ars numeric(12,2) check (amount_ars is null or amount_ars >= 0),
  provider text not null default 'mercado_pago',
  provider_order_id text,
  priority smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists maurilio_tipster_promotions_active_idx
  on public.maurilio_tipster_promotions (placement, starts_at, ends_at, priority desc)
  where status = 'active';

create or replace function public.maurilio_tipster_tip_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.content_hash := encode(
    digest(
      concat_ws(
        '|',
        new.tipster_id::text,
        new.public_id,
        new.sport,
        new.competition,
        new.event,
        new.market,
        new.selection,
        new.bookmaker,
        new.entry_odds::text,
        new.stake_units::text,
        to_char(new.event_start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        to_char(new.published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ),
      'sha256'
    ),
    'hex'
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists maurilio_tipster_tip_hash_before_write on public.maurilio_tipster_tips;
create trigger maurilio_tipster_tip_hash_before_write
before insert or update of
  tipster_id, public_id, sport, competition, event, market, selection,
  bookmaker, entry_odds, stake_units, event_start_at, published_at
on public.maurilio_tipster_tips
for each row execute function public.maurilio_tipster_tip_hash();

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

drop trigger if exists maurilio_tipster_tip_immutable_update on public.maurilio_tipster_tips;
create trigger maurilio_tipster_tip_immutable_update
before update on public.maurilio_tipster_tips
for each row execute function public.maurilio_tipster_tip_immutable_guard();

drop trigger if exists maurilio_tipster_tip_immutable_delete on public.maurilio_tipster_tips;
create trigger maurilio_tipster_tip_immutable_delete
before delete on public.maurilio_tipster_tips
for each row execute function public.maurilio_tipster_tip_immutable_guard();

create or replace view public.maurilio_tipster_public_stats_90d
with (security_invoker = false)
as
with settled as (
  select
    t.*,
    sum(t.profit_units) over (
      partition by t.tipster_id
      order by t.settled_at, t.id
      rows between unbounded preceding and current row
    ) as cumulative_profit
  from public.maurilio_tipster_tips t
  where t.status = 'settled'
    and t.settled_at >= now() - interval '90 days'
),
drawdowns as (
  select
    s.*,
    s.cumulative_profit - max(s.cumulative_profit) over (
      partition by s.tipster_id
      order by s.settled_at, s.id
      rows between unbounded preceding and current row
    ) as drawdown
  from settled s
)
select
  tipster_id,
  count(*)::int as picks_count,
  count(*) filter (where result = 'win')::int as wins,
  count(*) filter (where result = 'loss')::int as losses,
  count(*) filter (where result in ('push','void'))::int as pushes,
  coalesce(sum(stake_units),0)::numeric(12,4) as staked_units,
  coalesce(sum(profit_units),0)::numeric(12,4) as profit_units,
  case when sum(stake_units) > 0
    then (sum(profit_units) / sum(stake_units) * 100)::numeric(10,2)
    else null
  end as roi_pct,
  case when count(*) filter (where result in ('win','loss')) > 0
    then (
      count(*) filter (where result = 'win')::numeric
      / count(*) filter (where result in ('win','loss'))::numeric
      * 100
    )::numeric(10,2)
    else null
  end as win_rate_pct,
  avg(entry_odds)::numeric(8,3) as avg_odds,
  avg(clv_pct) filter (where clv_pct is not null)::numeric(10,2) as avg_clv_pct,
  abs(coalesce(min(drawdown),0))::numeric(12,4) as max_drawdown_units,
  max(settled_at) as last_settled_at
from drawdowns
group by tipster_id;

create or replace view public.maurilio_tipster_search_public
with (security_invoker = false)
as
select
  t.id,
  t.slug,
  t.display_name,
  t.avatar_url,
  t.headline,
  t.sports,
  t.specialties,
  t.monthly_price_ars,
  t.currency,
  t.is_verified,
  t.accepting_subscribers,
  coalesce(s.picks_count,0) as picks_count_90d,
  s.roi_pct as roi_pct_90d,
  s.win_rate_pct as win_rate_pct_90d,
  s.avg_odds as avg_odds_90d,
  s.avg_clv_pct as avg_clv_pct_90d,
  s.max_drawdown_units as max_drawdown_units_90d,
  (
    select count(*)::int
    from public.maurilio_tipster_tips open_tip
    where open_tip.tipster_id = t.id
      and open_tip.status = 'published'
      and open_tip.event_start_at > now()
  ) as open_tips_count,
  exists (
    select 1
    from public.maurilio_tipster_promotions p
    where p.tipster_id = t.id
      and p.placement = 'search_top'
      and p.status = 'active'
      and p.starts_at is not null
      and p.ends_at is not null
      and now() >= p.starts_at
      and now() < p.ends_at
  ) as sponsored,
  coalesce((
    select max(p.priority)
    from public.maurilio_tipster_promotions p
    where p.tipster_id = t.id
      and p.placement = 'search_top'
      and p.status = 'active'
      and p.starts_at is not null
      and p.ends_at is not null
      and now() >= p.starts_at
      and now() < p.ends_at
  ),0) as sponsor_priority
from public.maurilio_tipsters t
left join public.maurilio_tipster_public_stats_90d s on s.tipster_id = t.id
where t.status = 'published';

alter table public.maurilio_accounts enable row level security;
alter table public.maurilio_tipsters enable row level security;
alter table public.maurilio_tipster_tips enable row level security;
alter table public.maurilio_tipster_subscriptions enable row level security;
alter table public.maurilio_tipster_promotions enable row level security;

revoke all on table public.maurilio_accounts from anon, authenticated;
revoke all on table public.maurilio_tipsters from anon, authenticated;
revoke all on table public.maurilio_tipster_tips from anon, authenticated;
revoke all on table public.maurilio_tipster_subscriptions from anon, authenticated;
revoke all on table public.maurilio_tipster_promotions from anon, authenticated;
revoke all on table public.maurilio_tipster_public_stats_90d from anon, authenticated;
revoke all on table public.maurilio_tipster_search_public from anon, authenticated;

insert into public.maurilio_tipsters (
  slug,
  display_name,
  headline,
  sports,
  specialties,
  is_verified,
  accepting_subscribers,
  status
)
select
  'maurilio',
  'Maurilio',
  'Probabilidades verificadas, no promesas.',
  array['Fútbol'],
  array['Value','Tarjetas','Goles'],
  true,
  false,
  'published'
where not exists (
  select 1 from public.maurilio_tipsters where slug = 'maurilio'
);
