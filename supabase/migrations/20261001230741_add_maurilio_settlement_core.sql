alter table public.maurilio_picks
  add constraint maurilio_published_pick_requires_stake_ars
  check (status <> 'published' or (stake_ars is not null and stake_ars > 0))
  not valid;

alter table public.maurilio_picks
  validate constraint maurilio_published_pick_requires_stake_ars;

create or replace function public.maurilio_settle_pick(
  p_public_id text,
  p_result text,
  p_closing_odds numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pick public.maurilio_picks%rowtype;
  v_pnl numeric(14,2);
  v_matchday_status text;
begin
  if p_result not in ('win','loss','push','void') then
    raise exception 'invalid_result';
  end if;

  select *
  into v_pick
  from public.maurilio_picks
  where public_id = p_public_id
  for update;

  if not found then raise exception 'pick_not_found'; end if;
  if v_pick.status <> 'published' then raise exception 'pick_not_open'; end if;

  if p_result <> 'void' and (p_closing_odds is null or p_closing_odds <= 1) then
    raise exception 'closing_odds_required';
  end if;

  if v_pick.stake_ars is null or v_pick.stake_ars <= 0 then
    raise exception 'stake_ars_required';
  end if;

  v_pnl := case p_result
    when 'win' then round(v_pick.stake_ars * (v_pick.entry_odds - 1), 2)
    when 'loss' then -v_pick.stake_ars
    else 0
  end;

  update public.maurilio_picks
  set
    result = p_result,
    closing_odds = p_closing_odds,
    pnl_ars = v_pnl,
    status = 'settled',
    settled_at = now(),
    updated_at = now()
  where id = v_pick.id;

  if not exists (
    select 1
    from public.maurilio_picks
    where matchday_id = v_pick.matchday_id
      and status = 'published'
  ) then
    update public.maurilio_matchdays
    set status = 'settled', updated_at = now()
    where id = v_pick.matchday_id
      and status = 'published';
  end if;

  select status into v_matchday_status
  from public.maurilio_matchdays
  where id = v_pick.matchday_id;

  return jsonb_build_object(
    'public_id', v_pick.public_id,
    'result', p_result,
    'closing_odds', p_closing_odds,
    'pnl_ars', v_pnl,
    'matchday_status', v_matchday_status
  );
end;
$$;

revoke all on function public.maurilio_settle_pick(text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.maurilio_settle_pick(text,text,numeric)
  to service_role;
