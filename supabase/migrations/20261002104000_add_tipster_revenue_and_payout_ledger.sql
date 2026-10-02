create table if not exists public.maurilio_tipster_payouts (
  id uuid primary key default gen_random_uuid(),
  tipster_id uuid not null references public.maurilio_tipsters(id) on delete restrict,
  amount_ars numeric(14,2) not null check (amount_ars > 0),
  status text not null default 'pending'
    check (status in ('pending','paid','cancelled')),
  provider_reference text,
  period_from timestamptz,
  period_to timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maurilio_tipster_payouts_tipster_idx
  on public.maurilio_tipster_payouts (tipster_id, created_at desc);

alter table public.maurilio_tipster_payouts enable row level security;
revoke all on table public.maurilio_tipster_payouts from anon, authenticated;

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
  pending_subscribers integer;
  approved_charges integer;
  gross numeric(14,2);
  fees numeric(14,2);
  net numeric(14,2);
  paid_out numeric(14,2);
  pending_payout numeric(14,2);
  active_promo_end timestamptz;
begin
  uid := auth.uid();
  if uid is null then raise exception 'authentication_required'; end if;

  select * into t
  from public.maurilio_tipsters
  where owner_user_id = uid;

  if t.id is null then raise exception 'tipster_profile_required'; end if;

  select count(*) filter (where status = 'active'),
         count(*) filter (where status in ('pending','past_due','paused'))
  into active_subscribers, pending_subscribers
  from public.maurilio_tipster_subscriptions
  where tipster_id = t.id;

  select
    coalesce(r.approved_charges,0),
    coalesce(r.gross_ars,0),
    coalesce(r.platform_fee_ars,0),
    coalesce(r.tipster_net_ars,0)
  into approved_charges, gross, fees, net
  from public.maurilio_tipster_revenue_summary r
  where r.tipster_id = t.id;

  approved_charges := coalesce(approved_charges,0);
  gross := coalesce(gross,0);
  fees := coalesce(fees,0);
  net := coalesce(net,0);

  select
    coalesce(sum(amount_ars) filter (where status = 'paid'),0),
    coalesce(sum(amount_ars) filter (where status = 'pending'),0)
  into paid_out, pending_payout
  from public.maurilio_tipster_payouts
  where tipster_id = t.id;

  select max(ends_at)
  into active_promo_end
  from public.maurilio_tipster_promotions
  where tipster_id = t.id
    and status = 'active'
    and ends_at > now();

  return jsonb_build_object(
    'tipsterId', t.id,
    'activeSubscribers', coalesce(active_subscribers,0),
    'pendingSubscribers', coalesce(pending_subscribers,0),
    'approvedCharges', approved_charges,
    'grossArs', gross,
    'platformFeeArs', fees,
    'tipsterNetArs', net,
    'paidOutArs', coalesce(paid_out,0),
    'pendingPayoutArs', coalesce(pending_payout,0),
    'balanceArs', greatest(
      net - coalesce(paid_out,0) - coalesce(pending_payout,0),
      0
    ),
    'activePromotionEndsAt', active_promo_end
  );
end;
$$;

revoke all on function public.maurilio_my_tipster_dashboard() from public;
grant execute on function public.maurilio_my_tipster_dashboard() to authenticated;
