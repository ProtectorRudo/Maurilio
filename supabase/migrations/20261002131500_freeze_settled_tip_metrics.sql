create or replace function public.maurilio_tipster_tip_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'published_tip_is_immutable';
  end if;

  if old.tipster_id is distinct from new.tipster_id
    or old.public_id is distinct from new.public_id
    or old.sport is distinct from new.sport
    or old.competition is distinct from new.competition
    or old.event is distinct from new.event
    or old.market is distinct from new.market
    or old.selection is distinct from new.selection
    or old.bookmaker is distinct from new.bookmaker
    or old.entry_odds is distinct from new.entry_odds
    or old.stake_units is distinct from new.stake_units
    or old.event_start_at is distinct from new.event_start_at
    or old.published_at is distinct from new.published_at
    or old.content_hash is distinct from new.content_hash
    or old.provider_event_id is distinct from new.provider_event_id
    or old.provider_selection_key is distinct from new.provider_selection_key
    or old.provider_market_key is distinct from new.provider_market_key
    or old.provider_bookmaker_key is distinct from new.provider_bookmaker_key
    or old.odds_captured_at is distinct from new.odds_captured_at
    or old.provider_price_updated_at is distinct from new.provider_price_updated_at
    or old.provider_capture is distinct from new.provider_capture
    or old.settlement_rule is distinct from new.settlement_rule
  then
    raise exception 'published_tip_core_fields_are_immutable';
  end if;

  if old.status = 'settled' and (
    old.status is distinct from new.status
    or old.result is distinct from new.result
    or old.closing_odds is distinct from new.closing_odds
    or old.profit_units is distinct from new.profit_units
    or old.clv_pct is distinct from new.clv_pct
    or old.settled_at is distinct from new.settled_at
    or old.settlement_capture is distinct from new.settlement_capture
    or old.settlement_verified_at is distinct from new.settlement_verified_at
  ) then
    raise exception 'settled_tip_is_immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
