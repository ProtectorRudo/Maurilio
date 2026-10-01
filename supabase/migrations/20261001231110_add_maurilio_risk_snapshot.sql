create or replace function public.maurilio_risk_snapshot()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with settled as (
    select
      coalesce(sum(pnl_ars), 0)::numeric as pnl_ars,
      coalesce(sum(stake_ars), 0)::numeric as settled_stake_ars,
      count(*)::int as settled_count,
      avg(
        case
          when entry_odds is not null and closing_odds is not null and closing_odds > 0
          then (entry_odds / closing_odds) - 1
          else null
        end
      )::numeric as avg_clv
    from public.maurilio_picks
    where status = 'settled'
  ),
  open_picks as (
    select
      coalesce(sum(stake_ars), 0)::numeric as open_stake_ars,
      count(*)::int as open_count
    from public.maurilio_picks
    where status = 'published'
  ),
  snapshot as (
    select
      100000::numeric as initial_bank_ars,
      (100000::numeric + settled.pnl_ars) as bank_ars,
      settled.pnl_ars,
      settled.settled_stake_ars,
      settled.settled_count,
      settled.avg_clv,
      open_picks.open_stake_ars,
      open_picks.open_count
    from settled cross join open_picks
  )
  select jsonb_build_object(
    'initial_bank_ars', initial_bank_ars,
    'bank_ars', bank_ars,
    'pnl_ars', pnl_ars,
    'settled_stake_ars', settled_stake_ars,
    'roi', case when settled_stake_ars > 0 then pnl_ars / settled_stake_ars else null end,
    'avg_clv', avg_clv,
    'settled_count', settled_count,
    'open_stake_ars', open_stake_ars,
    'open_count', open_count,
    'open_exposure_pct', case when bank_ars > 0 then open_stake_ars / bank_ars else null end
  )
  from snapshot;
$$;

revoke all on function public.maurilio_risk_snapshot()
  from public, anon, authenticated;
grant execute on function public.maurilio_risk_snapshot()
  to service_role;
