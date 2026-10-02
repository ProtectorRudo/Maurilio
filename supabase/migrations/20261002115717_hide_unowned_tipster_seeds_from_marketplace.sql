create or replace view public.maurilio_tipster_search_public
with (security_invoker = true)
as
select
  t.id,
  t.slug,
  t.display_name,
  t.avatar_url,
  t.headline,
  t.sports,
  t.specialties,
  t.monthly_price_ars,
  t.currency,
  t.is_verified,
  t.accepting_subscribers,
  coalesce(s.picks_count, 0) as picks_count_90d,
  s.roi_pct as roi_pct_90d,
  s.win_rate_pct as win_rate_pct_90d,
  s.avg_odds as avg_odds_90d,
  s.avg_clv_pct as avg_clv_pct_90d,
  s.max_drawdown_units as max_drawdown_units_90d,
  (
    select count(*)::integer
    from public.maurilio_tipster_tips open_tip
    where open_tip.tipster_id = t.id
      and open_tip.status = 'published'
      and open_tip.event_start_at > now()
  ) as open_tips_count,
  exists (
    select 1
    from public.maurilio_tipster_promotions p
    where p.tipster_id = t.id
      and p.placement = 'search_top'
      and p.status = 'active'
      and p.starts_at is not null
      and p.ends_at is not null
      and now() >= p.starts_at
      and now() < p.ends_at
  ) as sponsored,
  coalesce((
    select max(p.priority)::integer
    from public.maurilio_tipster_promotions p
    where p.tipster_id = t.id
      and p.placement = 'search_top'
      and p.status = 'active'
      and p.starts_at is not null
      and p.ends_at is not null
      and now() >= p.starts_at
      and now() < p.ends_at
  ), 0) as sponsor_priority
from public.maurilio_tipsters t
left join public.maurilio_tipster_public_stats_90d s on s.tipster_id = t.id
where t.status = 'published'
  and t.owner_user_id is not null;
