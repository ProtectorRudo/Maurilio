alter table public.maurilio_marketplace_admin_events
  drop constraint if exists maurilio_marketplace_admin_events_event_type_check;

alter table public.maurilio_marketplace_admin_events
  add constraint maurilio_marketplace_admin_events_event_type_check
  check (event_type in (
    'tipster_state_changed',
    'tipster_verified_changed',
    'payout_paid',
    'payout_cancelled'
  ));

create or replace function public.maurilio_request_full_payout()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  t public.maurilio_tipsters%rowtype;
  net numeric(14,2);
  paid_out numeric(14,2);
  pending_payout numeric(14,2);
  available numeric(14,2);
  payout_row public.maurilio_tipster_payouts%rowtype;
begin
  uid := auth.uid();
  if uid is null then raise exception 'authentication_required'; end if;

  select * into t
  from public.maurilio_tipsters
  where owner_user_id = uid;

  if t.id is null then raise exception 'tipster_profile_required'; end if;

  select coalesce(r.tipster_net_ars,0)
  into net
  from public.maurilio_tipster_revenue_summary r
  where r.tipster_id = t.id;

  net := coalesce(net,0);

  select
    coalesce(sum(amount_ars) filter (where status = 'paid'),0),
    coalesce(sum(amount_ars) filter (where status = 'pending'),0)
  into paid_out, pending_payout
  from public.maurilio_tipster_payouts
  where tipster_id = t.id;

  if coalesce(pending_payout,0) > 0 then
    raise exception 'payout_already_pending';
  end if;

  available := greatest(net - coalesce(paid_out,0), 0);

  if available <= 0 then
    raise exception 'no_payout_balance';
  end if;

  insert into public.maurilio_tipster_payouts (
    tipster_id, amount_ars, status, period_to, created_at, updated_at
  ) values (
    t.id, available, 'pending', now(), now(), now()
  )
  returning * into payout_row;

  return jsonb_build_object(
    'id', payout_row.id,
    'amountArs', payout_row.amount_ars,
    'status', payout_row.status,
    'createdAt', payout_row.created_at
  );
end;
$$;

revoke all on function public.maurilio_request_full_payout() from public;
revoke execute on function public.maurilio_request_full_payout() from anon;
grant execute on function public.maurilio_request_full_payout() to authenticated;

create or replace function public.maurilio_admin_list_payouts()
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
  if uid is null then raise exception 'authentication_required'; end if;

  select role into role_value
  from public.maurilio_accounts
  where user_id = uid;

  if role_value is distinct from 'admin' then raise exception 'admin_required'; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'tipsterId', p.tipster_id,
        'tipsterSlug', t.slug,
        'tipsterName', t.display_name,
        'amountArs', p.amount_ars,
        'status', p.status,
        'providerReference', p.provider_reference,
        'createdAt', p.created_at,
        'paidAt', p.paid_at
      )
      order by case when p.status = 'pending' then 0 else 1 end, p.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.maurilio_tipster_payouts p
  join public.maurilio_tipsters t on t.id = p.tipster_id;

  return result;
end;
$$;

revoke all on function public.maurilio_admin_list_payouts() from public;
revoke execute on function public.maurilio_admin_list_payouts() from anon;
grant execute on function public.maurilio_admin_list_payouts() to authenticated;

create or replace function public.maurilio_admin_set_payout_state(
  p_payout_id uuid,
  p_status text,
  p_provider_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_value text;
  before_row public.maurilio_tipster_payouts%rowtype;
  after_row public.maurilio_tipster_payouts%rowtype;
  clean_reference text;
begin
  uid := auth.uid();
  if uid is null then raise exception 'authentication_required'; end if;

  select role into role_value
  from public.maurilio_accounts
  where user_id = uid;

  if role_value is distinct from 'admin' then raise exception 'admin_required'; end if;
  if p_status not in ('paid','cancelled') then raise exception 'invalid_payout_status'; end if;

  clean_reference := nullif(trim(coalesce(p_provider_reference,'')), '');
  if p_status = 'paid' and clean_reference is null then
    raise exception 'provider_reference_required';
  end if;

  select * into before_row
  from public.maurilio_tipster_payouts
  where id = p_payout_id
  for update;

  if before_row.id is null then raise exception 'payout_not_found'; end if;
  if before_row.status is distinct from 'pending' then raise exception 'payout_not_pending'; end if;

  update public.maurilio_tipster_payouts
  set
    status = p_status,
    provider_reference = case when p_status = 'paid' then clean_reference else provider_reference end,
    paid_at = case when p_status = 'paid' then now() else paid_at end,
    updated_at = now()
  where id = p_payout_id
  returning * into after_row;

  insert into public.maurilio_marketplace_admin_events (
    admin_user_id, tipster_id, event_type, payload
  ) values (
    uid,
    after_row.tipster_id,
    case when p_status = 'paid' then 'payout_paid' else 'payout_cancelled' end,
    jsonb_build_object(
      'payoutId', after_row.id,
      'amountArs', after_row.amount_ars,
      'providerReference', after_row.provider_reference
    )
  );

  return jsonb_build_object(
    'id', after_row.id,
    'amountArs', after_row.amount_ars,
    'status', after_row.status,
    'providerReference', after_row.provider_reference,
    'paidAt', after_row.paid_at
  );
end;
$$;

revoke all on function public.maurilio_admin_set_payout_state(uuid,text,text) from public;
revoke execute on function public.maurilio_admin_set_payout_state(uuid,text,text) from anon;
grant execute on function public.maurilio_admin_set_payout_state(uuid,text,text) to authenticated;
