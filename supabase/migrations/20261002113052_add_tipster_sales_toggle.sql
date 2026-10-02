create or replace function public.maurilio_set_tipster_sales(
  p_accepting boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  tipster_row public.maurilio_tipsters%rowtype;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication_required';
  end if;

  select *
  into tipster_row
  from public.maurilio_tipsters
  where owner_user_id = uid;

  if tipster_row.id is null then
    raise exception 'tipster_profile_required';
  end if;

  if p_accepting and (
    tipster_row.monthly_price_ars is null or
    tipster_row.monthly_price_ars <= 0
  ) then
    raise exception 'valid_subscription_price_required';
  end if;

  update public.maurilio_tipsters
  set
    accepting_subscribers = p_accepting,
    updated_at = now()
  where id = tipster_row.id
  returning * into tipster_row;

  return jsonb_build_object(
    'id', tipster_row.id,
    'slug', tipster_row.slug,
    'acceptingSubscribers', tipster_row.accepting_subscribers,
    'monthlyPriceArs', tipster_row.monthly_price_ars
  );
end;
$$;

revoke all on function public.maurilio_set_tipster_sales(boolean) from public;
revoke execute on function public.maurilio_set_tipster_sales(boolean) from anon;
grant execute on function public.maurilio_set_tipster_sales(boolean) to authenticated;
