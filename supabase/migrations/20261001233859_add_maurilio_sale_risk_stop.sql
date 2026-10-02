alter table public.maurilio_picks
  add column if not exists sale_status text not null default 'open'
    check (sale_status in ('open','closed')),
  add column if not exists sale_closed_reason text
    check (
      sale_closed_reason is null
      or sale_closed_reason in (
        'price_below_minimum',
        'market_unavailable',
        'late_information',
        'manual_risk_stop'
      )
    ),
  add column if not exists sale_closed_at timestamptz,
  add column if not exists last_observed_odds numeric(10,4)
    check (last_observed_odds is null or last_observed_odds > 1),
  add column if not exists last_observed_at timestamptz;

create or replace function public.maurilio_close_pick_sale(
  p_public_id text,
  p_reason text,
  p_observed_odds numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pick public.maurilio_picks%rowtype;
begin
  if p_reason not in (
    'price_below_minimum',
    'market_unavailable',
    'late_information',
    'manual_risk_stop'
  ) then
    raise exception 'invalid_sale_close_reason';
  end if;

  select *
  into v_pick
  from public.maurilio_picks
  where public_id = p_public_id
  for update;

  if not found then raise exception 'pick_not_found'; end if;
  if v_pick.status <> 'published' then raise exception 'pick_not_open'; end if;
  if v_pick.sale_status <> 'open' then raise exception 'sale_already_closed'; end if;
  if v_pick.event_start_at is null or v_pick.event_start_at <= now() then
    raise exception 'event_already_started';
  end if;

  if p_reason = 'price_below_minimum' then
    if p_observed_odds is null or p_observed_odds <= 1 then
      raise exception 'observed_odds_required';
    end if;
    if v_pick.minimum_odds is null or p_observed_odds >= v_pick.minimum_odds then
      raise exception 'observed_odds_not_below_minimum';
    end if;
  elsif p_observed_odds is not null and p_observed_odds <= 1 then
    raise exception 'invalid_observed_odds';
  end if;

  update public.maurilio_picks
  set
    sale_status = 'closed',
    sale_closed_reason = p_reason,
    sale_closed_at = now(),
    last_observed_odds = p_observed_odds,
    last_observed_at = now(),
    updated_at = now()
  where id = v_pick.id;

  return jsonb_build_object(
    'public_id', v_pick.public_id,
    'sale_status', 'closed',
    'reason', p_reason,
    'observed_odds', p_observed_odds,
    'minimum_odds', v_pick.minimum_odds,
    'closed_at', now()
  );
end;
$$;

revoke all on function public.maurilio_close_pick_sale(text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.maurilio_close_pick_sale(text,text,numeric)
  to service_role;
