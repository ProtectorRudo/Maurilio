create or replace function public.maurilio_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  account_row public.maurilio_accounts%rowtype;
  tipster_row public.maurilio_tipsters%rowtype;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication_required';
  end if;

  select *
  into account_row
  from public.maurilio_accounts
  where user_id = uid;

  if account_row.user_id is null then
    raise exception 'account_not_found';
  end if;

  select *
  into tipster_row
  from public.maurilio_tipsters
  where owner_user_id = uid;

  return jsonb_build_object(
    'userId', account_row.user_id,
    'role', account_row.role,
    'displayName', account_row.display_name,
    'tipster',
      case
        when tipster_row.id is null then null
        else jsonb_build_object(
          'id', tipster_row.id,
          'slug', tipster_row.slug,
          'displayName', tipster_row.display_name,
          'headline', tipster_row.headline,
          'sports', tipster_row.sports,
          'specialties', tipster_row.specialties,
          'monthlyPriceArs', tipster_row.monthly_price_ars,
          'isVerified', tipster_row.is_verified,
          'acceptingSubscribers', tipster_row.accepting_subscribers,
          'status', tipster_row.status
        )
      end
  );
end;
$$;

revoke all on function public.maurilio_my_account() from public;
grant execute on function public.maurilio_my_account() to authenticated;

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
  if uid is null then
    raise exception 'authentication_required';
  end if;

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
    owner_user_id,
    slug,
    display_name,
    headline,
    sports,
    specialties,
    monthly_price_ars,
    currency,
    accepting_subscribers,
    status,
    created_at,
    updated_at
  )
  values (
    uid,
    clean_slug,
    clean_name,
    nullif(trim(coalesce(p_headline,'')), ''),
    coalesce(p_sports,'{}'),
    coalesce(p_specialties,'{}'),
    p_monthly_price_ars,
    'ARS',
    false,
    'published',
    now(),
    now()
  )
  on conflict (owner_user_id)
  do update set
    slug = excluded.slug,
    display_name = excluded.display_name,
    headline = excluded.headline,
    sports = excluded.sports,
    specialties = excluded.specialties,
    monthly_price_ars = excluded.monthly_price_ars,
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
    'status', row.status
  );
end;
$$;

revoke all on function public.maurilio_upsert_tipster_profile(
  text,text,text,text[],text[],numeric
) from public;
grant execute on function public.maurilio_upsert_tipster_profile(
  text,text,text,text[],text[],numeric
) to authenticated;
