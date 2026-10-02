create table if not exists public.maurilio_marketplace_admin_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  tipster_id uuid references public.maurilio_tipsters(id) on delete restrict,
  event_type text not null check (event_type in ('tipster_state_changed','tipster_verified_changed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.maurilio_marketplace_admin_events enable row level security;
revoke all on table public.maurilio_marketplace_admin_events from anon, authenticated;

create index if not exists maurilio_marketplace_admin_events_tipster_created_idx
  on public.maurilio_marketplace_admin_events (tipster_id, created_at desc);

create or replace function public.maurilio_admin_list_tipsters()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_value text;
  result jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication_required';
  end if;

  select role into role_value
  from public.maurilio_accounts
  where user_id = uid;

  if role_value is distinct from 'admin' then
    raise exception 'admin_required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'ownerUserId', t.owner_user_id,
        'slug', t.slug,
        'displayName', t.display_name,
        'headline', t.headline,
        'sports', t.sports,
        'specialties', t.specialties,
        'monthlyPriceArs', t.monthly_price_ars,
        'currency', t.currency,
        'verified', t.is_verified,
        'acceptingSubscribers', t.accepting_subscribers,
        'status', t.status,
        'createdAt', t.created_at,
        'updatedAt', t.updated_at,
        'picksCount90d', coalesce(s.picks_count, 0),
        'roiPct90d', s.roi_pct,
        'winRatePct90d', s.win_rate_pct,
        'avgClvPct90d', s.avg_clv_pct
      )
      order by t.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.maurilio_tipsters t
  left join public.maurilio_tipster_public_stats_90d s on s.tipster_id = t.id
  where t.owner_user_id is not null;

  return result;
end;
$$;

revoke all on function public.maurilio_admin_list_tipsters() from public;
revoke execute on function public.maurilio_admin_list_tipsters() from anon;
grant execute on function public.maurilio_admin_list_tipsters() to authenticated;

create or replace function public.maurilio_admin_set_tipster_state(
  p_tipster_id uuid,
  p_status text default null,
  p_verified boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_value text;
  before_row public.maurilio_tipsters%rowtype;
  after_row public.maurilio_tipsters%rowtype;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication_required';
  end if;

  select role into role_value
  from public.maurilio_accounts
  where user_id = uid;

  if role_value is distinct from 'admin' then
    raise exception 'admin_required';
  end if;

  if p_status is not null and p_status not in ('draft','published','suspended') then
    raise exception 'invalid_status';
  end if;

  select * into before_row
  from public.maurilio_tipsters
  where id = p_tipster_id
  for update;

  if before_row.id is null then
    raise exception 'tipster_not_found';
  end if;

  update public.maurilio_tipsters
  set
    status = coalesce(p_status, status),
    is_verified = coalesce(p_verified, is_verified),
    accepting_subscribers = case
      when coalesce(p_status, status) = 'suspended' then false
      else accepting_subscribers
    end,
    updated_at = now()
  where id = p_tipster_id
  returning * into after_row;

  if before_row.status is distinct from after_row.status then
    insert into public.maurilio_marketplace_admin_events (
      admin_user_id, tipster_id, event_type, payload
    ) values (
      uid, after_row.id, 'tipster_state_changed',
      jsonb_build_object('before', before_row.status, 'after', after_row.status)
    );
  end if;

  if before_row.is_verified is distinct from after_row.is_verified then
    insert into public.maurilio_marketplace_admin_events (
      admin_user_id, tipster_id, event_type, payload
    ) values (
      uid, after_row.id, 'tipster_verified_changed',
      jsonb_build_object('before', before_row.is_verified, 'after', after_row.is_verified)
    );
  end if;

  return jsonb_build_object(
    'id', after_row.id,
    'slug', after_row.slug,
    'displayName', after_row.display_name,
    'status', after_row.status,
    'verified', after_row.is_verified,
    'acceptingSubscribers', after_row.accepting_subscribers
  );
end;
$$;

revoke all on function public.maurilio_admin_set_tipster_state(uuid,text,boolean) from public;
revoke execute on function public.maurilio_admin_set_tipster_state(uuid,text,boolean) from anon;
grant execute on function public.maurilio_admin_set_tipster_state(uuid,text,boolean) to authenticated;
