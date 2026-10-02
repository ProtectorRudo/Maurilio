alter table public.maurilio_tipster_subscriptions
  drop constraint if exists maurilio_tipster_subscriptions_status_check;

alter table public.maurilio_tipster_subscriptions
  add constraint maurilio_tipster_subscriptions_status_check
  check (status in ('pending','active','past_due','cancelled','expired'));

alter table public.maurilio_tipster_subscriptions
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists last_payment_at timestamptz;

drop index if exists public.maurilio_tipster_subscriptions_active_unique;

create unique index maurilio_tipster_subscriptions_active_unique
  on public.maurilio_tipster_subscriptions (subscriber_user_id, tipster_id)
  where status in ('pending','active','past_due');

create table if not exists public.maurilio_subscription_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text,
  action text,
  provider_object_id text,
  request_id text,
  status text not null default 'received'
    check (status in ('received','processed','ignored','failed')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.maurilio_subscription_webhook_events enable row level security;
revoke all on table public.maurilio_subscription_webhook_events from anon, authenticated;

create or replace function public.maurilio_upsert_tipster_profile(
  p_slug text,
  p_display_name text,
  p_headline text default null,
  p_sports text[] default '{}',
  p_specialties text[] default '{}',
  p_monthly_price_ars numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_value text;
  clean_slug text;
  clean_name text;
  row public.maurilio_tipsters%rowtype;
begin
  uid := auth.uid();
  if uid is null then raise exception 'authentication_required'; end if;

  select role into role_value
  from public.maurilio_accounts
  where user_id = uid;

  if role_value is distinct from 'tipster' then
    raise exception 'tipster_role_required';
  end if;

  clean_slug := lower(trim(coalesce(p_slug,'')));
  clean_name := trim(coalesce(p_display_name,''));

  if clean_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception 'invalid_slug';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 60 then
    raise exception 'invalid_display_name';
  end if;

  if p_headline is not null and char_length(p_headline) > 120 then
    raise exception 'headline_too_long';
  end if;

  if p_monthly_price_ars is not null and p_monthly_price_ars < 0 then
    raise exception 'invalid_price';
  end if;

  insert into public.maurilio_tipsters (
    owner_user_id, slug, display_name, headline, sports, specialties,
    monthly_price_ars, currency, accepting_subscribers, status,
    created_at, updated_at
  )
  values (
    uid, clean_slug, clean_name, nullif(trim(coalesce(p_headline,'')), ''),
    coalesce(p_sports,'{}'), coalesce(p_specialties,'{}'), p_monthly_price_ars,
    'ARS', coalesce(p_monthly_price_ars,0) > 0, 'published', now(), now()
  )
  on conflict (owner_user_id)
  do update set
    slug = excluded.slug,
    display_name = excluded.display_name,
    headline = excluded.headline,
    sports = excluded.sports,
    specialties = excluded.specialties,
    monthly_price_ars = excluded.monthly_price_ars,
    accepting_subscribers = excluded.accepting_subscribers,
    updated_at = now()
  returning * into row;

  return jsonb_build_object(
    'id', row.id,
    'slug', row.slug,
    'displayName', row.display_name,
    'headline', row.headline,
    'sports', row.sports,
    'specialties', row.specialties,
    'monthlyPriceArs', row.monthly_price_ars,
    'acceptingSubscribers', row.accepting_subscribers,
    'status', row.status
  );
end;
$$;
