
create or replace function public.maurilio_my_tipster_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  t public.maurilio_tipsters%rowtype;
  active_subscribers integer;
  approved_charges integer;
  gross numeric(14,2);
  fees numeric(14,2);
  active_promo_end timestamptz;
  payment_connected boolean;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication_required';
  end if;

  select * into t
  from public.maurilio_tipsters
  where owner_user_id = uid;

  if t.id is null then
    raise exception 'tipster_profile_required';
  end if;

  select count(*)
  into active_subscribers
  from public.maurilio_tipster_subscriptions
  where tipster_id = t.id
    and status = 'active'
    and current_period_end > now();

  select
    coalesce(r.approved_charges,0),
    coalesce(r.gross_ars,0),
    coalesce(r.platform_fee_ars,0)
  into approved_charges, gross, fees
  from public.maurilio_tipster_revenue_summary r
  where r.tipster_id = t.id;

  approved_charges := coalesce(approved_charges,0);
  gross := coalesce(gross,0);
  fees := coalesce(fees,0);

  select max(ends_at)
  into active_promo_end
  from public.maurilio_tipster_promotions
  where tipster_id = t.id
    and status = 'active'
    and ends_at > now();

  select exists(
    select 1
    from public.maurilio_tipster_payment_accounts a
    where a.tipster_id = t.id
      and a.revoked_at is null
  )
  into payment_connected;

  return jsonb_build_object(
    'tipsterId', t.id,
    'activeSubscribers', coalesce(active_subscribers,0),
    'approvedCharges', approved_charges,
    'grossArs', gross,
    'platformFeeArs', fees,
    'paymentConnected', payment_connected,
    'acceptingSubscribers', t.accepting_subscribers,
    'monthlyPriceArs', t.monthly_price_ars,
    'activePromotionEndsAt', active_promo_end
  );
end;
$$;
