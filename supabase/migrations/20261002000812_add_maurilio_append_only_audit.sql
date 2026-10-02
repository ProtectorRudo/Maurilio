create table if not exists public.maurilio_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists maurilio_audit_events_entity_idx
  on public.maurilio_audit_events(entity_type, entity_id, created_at desc);

alter table public.maurilio_audit_events enable row level security;
revoke all on table public.maurilio_audit_events from anon, authenticated;
grant select, insert on table public.maurilio_audit_events to service_role;

create or replace function public.maurilio_guard_audit_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'audit_log_is_append_only';
end;
$$;

drop trigger if exists maurilio_guard_audit_update_trigger on public.maurilio_audit_events;
create trigger maurilio_guard_audit_update_trigger
before update on public.maurilio_audit_events
for each row execute function public.maurilio_guard_audit_immutable();

drop trigger if exists maurilio_guard_audit_delete_trigger on public.maurilio_audit_events;
create trigger maurilio_guard_audit_delete_trigger
before delete on public.maurilio_audit_events
for each row execute function public.maurilio_guard_audit_immutable();

revoke all on function public.maurilio_guard_audit_immutable()
  from public, anon, authenticated;

create or replace function public.maurilio_guard_published_pick()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.published_at is not null then
    if
      new.matchday_id is distinct from old.matchday_id or
      new.public_id is distinct from old.public_id or
      new.tier is distinct from old.tier or
      new.sport is distinct from old.sport or
      new.competition is distinct from old.competition or
      new.event is distinct from old.event or
      new.market is distinct from old.market or
      new.selection is distinct from old.selection or
      new.bookmaker is distinct from old.bookmaker or
      new.entry_odds is distinct from old.entry_odds or
      new.minimum_odds is distinct from old.minimum_odds or
      new.probability_own is distinct from old.probability_own or
      new.probability_low is distinct from old.probability_low or
      new.probability_high is distinct from old.probability_high or
      new.stake_pct is distinct from old.stake_pct or
      new.stake_ars is distinct from old.stake_ars or
      new.thesis is distinct from old.thesis or
      new.principal_risk is distinct from old.principal_risk or
      new.odds_captured_at is distinct from old.odds_captured_at or
      new.event_start_at is distinct from old.event_start_at or
      new.published_at is distinct from old.published_at
    then
      raise exception 'published_pick_is_immutable';
    end if;

    if old.sale_status = 'closed' and (
      new.sale_status is distinct from old.sale_status or
      new.sale_closed_reason is distinct from old.sale_closed_reason or
      new.sale_closed_at is distinct from old.sale_closed_at or
      new.last_observed_odds is distinct from old.last_observed_odds or
      new.last_observed_at is distinct from old.last_observed_at
    ) then
      raise exception 'sale_stop_is_immutable';
    end if;

    if old.sale_status = 'open' and new.sale_status = 'open' and (
      new.sale_closed_reason is not null or new.sale_closed_at is not null
    ) then
      raise exception 'invalid_open_sale_state';
    end if;

    if old.sale_status = 'open' and new.sale_status = 'closed' then
      if new.sale_closed_reason is null or new.sale_closed_at is null then
        raise exception 'sale_stop_requires_reason_and_time';
      end if;
      if new.sale_closed_reason = 'price_below_minimum' then
        if new.last_observed_odds is null or old.minimum_odds is null
           or new.last_observed_odds >= old.minimum_odds then
          raise exception 'invalid_price_sale_stop';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.maurilio_close_pick_sale(
  p_public_id text,
  p_reason text,
  p_observed_odds numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pick public.maurilio_picks%rowtype;
  v_closed_at timestamptz := now();
begin
  if p_reason not in ('price_below_minimum','market_unavailable','late_information','manual_risk_stop') then
    raise exception 'invalid_sale_close_reason';
  end if;

  select * into v_pick from public.maurilio_picks
  where public_id = p_public_id for update;

  if not found then raise exception 'pick_not_found'; end if;
  if v_pick.status <> 'published' then raise exception 'pick_not_open'; end if;
  if v_pick.sale_status <> 'open' then raise exception 'sale_already_closed'; end if;
  if v_pick.event_start_at is null or v_pick.event_start_at <= now() then
    raise exception 'event_already_started';
  end if;

  if p_reason = 'price_below_minimum' then
    if p_observed_odds is null or p_observed_odds <= 1 then raise exception 'observed_odds_required'; end if;
    if v_pick.minimum_odds is null or p_observed_odds >= v_pick.minimum_odds then
      raise exception 'observed_odds_not_below_minimum';
    end if;
  elsif p_observed_odds is not null and p_observed_odds <= 1 then
    raise exception 'invalid_observed_odds';
  end if;

  update public.maurilio_picks set
    sale_status='closed',
    sale_closed_reason=p_reason,
    sale_closed_at=v_closed_at,
    last_observed_odds=p_observed_odds,
    last_observed_at=v_closed_at,
    updated_at=v_closed_at
  where id=v_pick.id;

  insert into public.maurilio_audit_events(event_type,entity_type,entity_id,payload)
  values ('sale_closed','pick',v_pick.public_id,jsonb_build_object(
    'reason',p_reason,'observed_odds',p_observed_odds,'minimum_odds',v_pick.minimum_odds,'closed_at',v_closed_at
  ));

  return jsonb_build_object(
    'public_id',v_pick.public_id,'sale_status','closed','reason',p_reason,
    'observed_odds',p_observed_odds,'minimum_odds',v_pick.minimum_odds,'closed_at',v_closed_at
  );
end;
$$;

revoke all on function public.maurilio_close_pick_sale(text,text,numeric) from public, anon, authenticated;
grant execute on function public.maurilio_close_pick_sale(text,text,numeric) to service_role;

create or replace function public.maurilio_settle_pick(
  p_public_id text,
  p_result text,
  p_closing_odds numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pick public.maurilio_picks%rowtype;
  v_pnl numeric(14,2);
  v_matchday_status text;
  v_settled_at timestamptz := now();
begin
  if p_result not in ('win','loss','push','void') then raise exception 'invalid_result'; end if;

  select * into v_pick from public.maurilio_picks
  where public_id=p_public_id for update;

  if not found then raise exception 'pick_not_found'; end if;
  if v_pick.status <> 'published' then raise exception 'pick_not_open'; end if;
  if p_result <> 'void' and (p_closing_odds is null or p_closing_odds <= 1) then
    raise exception 'closing_odds_required';
  end if;
  if v_pick.stake_ars is null or v_pick.stake_ars <= 0 then raise exception 'stake_ars_required'; end if;

  v_pnl := case p_result
    when 'win' then round(v_pick.stake_ars*(v_pick.entry_odds-1),2)
    when 'loss' then -v_pick.stake_ars
    else 0
  end;

  update public.maurilio_picks set
    result=p_result, closing_odds=p_closing_odds, pnl_ars=v_pnl,
    status='settled', settled_at=v_settled_at, updated_at=v_settled_at
  where id=v_pick.id;

  insert into public.maurilio_audit_events(event_type,entity_type,entity_id,payload)
  values ('pick_settled','pick',v_pick.public_id,jsonb_build_object(
    'result',p_result,'entry_odds',v_pick.entry_odds,'closing_odds',p_closing_odds,
    'stake_ars',v_pick.stake_ars,'pnl_ars',v_pnl,'settled_at',v_settled_at
  ));

  if not exists (
    select 1 from public.maurilio_picks
    where matchday_id=v_pick.matchday_id and status='published'
  ) then
    update public.maurilio_matchdays
    set status='settled', updated_at=v_settled_at
    where id=v_pick.matchday_id and status='published';
  end if;

  select status into v_matchday_status from public.maurilio_matchdays where id=v_pick.matchday_id;

  return jsonb_build_object(
    'public_id',v_pick.public_id,'result',p_result,'closing_odds',p_closing_odds,
    'pnl_ars',v_pnl,'matchday_status',v_matchday_status
  );
end;
$$;

revoke all on function public.maurilio_settle_pick(text,text,numeric) from public, anon, authenticated;
grant execute on function public.maurilio_settle_pick(text,text,numeric) to service_role;
