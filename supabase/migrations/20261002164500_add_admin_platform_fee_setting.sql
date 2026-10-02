create table if not exists public.maurilio_platform_settings (
  singleton boolean primary key default true check (singleton),
  platform_fee_bps integer check (
    platform_fee_bps is null or (platform_fee_bps between 1 and 5000)
  ),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.maurilio_platform_settings enable row level security;
revoke all on table public.maurilio_platform_settings from anon, authenticated;

insert into public.maurilio_platform_settings (singleton, platform_fee_bps)
values (true, null)
on conflict (singleton) do nothing;

create or replace function public.maurilio_admin_payment_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_value text;
  settings_row public.maurilio_platform_settings%rowtype;
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

  select *
  into settings_row
  from public.maurilio_platform_settings
  where singleton = true;

  return jsonb_build_object(
    'platformFeeBps', settings_row.platform_fee_bps,
    'updatedAt', settings_row.updated_at
  );
end;
$$;

create or replace function public.maurilio_admin_set_platform_fee(p_fee_bps integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_value text;
  previous_fee integer;
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

  if p_fee_bps is null or p_fee_bps < 1 or p_fee_bps > 5000 then
    raise exception 'invalid_platform_fee';
  end if;

  select platform_fee_bps
  into previous_fee
  from public.maurilio_platform_settings
  where singleton = true
  for update;

  update public.maurilio_platform_settings
  set
    platform_fee_bps = p_fee_bps,
    updated_by = uid,
    updated_at = now()
  where singleton = true;

  insert into public.maurilio_marketplace_admin_events (
    admin_user_id,
    tipster_id,
    event_type,
    payload
  ) values (
    uid,
    null,
    'platform_fee_changed',
    jsonb_build_object(
      'beforeBps', previous_fee,
      'afterBps', p_fee_bps
    )
  );

  return jsonb_build_object(
    'platformFeeBps', p_fee_bps,
    'updatedAt', now()
  );
end;
$$;

revoke execute on function public.maurilio_admin_payment_settings() from public, anon;
revoke execute on function public.maurilio_admin_set_platform_fee(integer) from public, anon;
grant execute on function public.maurilio_admin_payment_settings() to authenticated;
grant execute on function public.maurilio_admin_set_platform_fee(integer) to authenticated;
