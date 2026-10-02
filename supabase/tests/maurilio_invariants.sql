-- Run against a disposable/test database or inside an authorized SQL session.
-- Everything is wrapped in a transaction and rolled back.

begin;

create temporary table maurilio_invariant_results (
  test_name text primary key,
  passed boolean not null,
  detail text
) on commit drop;

select public.maurilio_publish_bundle(
  jsonb_build_object(
    'slug','2099-12-01',
    'match_date','2099-12-01',
    'label','INVARIANT TEST',
    'no_value',false,
    'picks',jsonb_build_array(
      jsonb_build_object(
        'public_id','CI-INVARIANT-FREE',
        'tier','free',
        'sport','football',
        'competition','TEST',
        'event','A vs B',
        'market','Over 1.5 goals',
        'selection','Over 1.5',
        'bookmaker','Bet365',
        'entry_odds',2.00,
        'minimum_odds',1.80,
        'probability_own',0.60,
        'probability_low',0.55,
        'probability_high',0.65,
        'stake_pct',0.01,
        'stake_ars',1000,
        'thesis','Invariant thesis',
        'principal_risk','Invariant risk',
        'odds_captured_at','2099-12-01T12:00:00-03:00',
        'event_start_at','2099-12-01T18:00:00-03:00'
      )
    )
  )
);

insert into maurilio_invariant_results
select
  'valid_publish',
  exists(
    select 1
    from public.maurilio_picks
    where public_id='CI-INVARIANT-FREE'
      and status='published'
      and event_start_at='2099-12-01T18:00:00-03:00'::timestamptz
  ),
  'valid published pick exists with event start';

insert into maurilio_invariant_results
select
  'publication_audited',
  exists(
    select 1 from public.maurilio_audit_events
    where event_type='pick_published'
      and entity_id='CI-INVARIANT-FREE'
  )
  and exists(
    select 1 from public.maurilio_audit_events
    where event_type='matchday_published'
      and entity_id='2099-12-01'
  ),
  'matchday and pick publication audit events exist';

do $$
declare
  v_matchday_id uuid;
begin
  select id into v_matchday_id
  from public.maurilio_matchdays
  where slug='2099-12-01';

  begin
    insert into public.maurilio_picks (
      matchday_id, public_id, tier, sport, competition, event, market, selection,
      bookmaker, entry_odds, minimum_odds, probability_own, probability_low,
      probability_high, stake_pct, stake_ars, thesis, principal_risk,
      odds_captured_at, event_start_at, status, published_at
    )
    values (
      v_matchday_id, 'CI-INVARIANT-FRAGILE', 'pro', 'football', 'TEST',
      'A vs B', 'Totals', 'Over', 'Bet365', 1.80, 1.70,
      0.60, 0.54, 0.66, 0.01, 1000,
      'Central value only', 'Lower bound loses value',
      '2099-12-01T12:05:00-03:00',
      '2099-12-01T18:00:00-03:00',
      'published', now()
    );

    insert into maurilio_invariant_results
    values ('reject_fragile_lower_bound', false, 'unexpected insert');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'reject_fragile_lower_bound',
      position('maurilio_published_pick_requires_positive_lower_ev' in sqlerrm) > 0,
      sqlerrm
    );
  end;

  begin
    insert into public.maurilio_picks (
      matchday_id, public_id, tier, sport, competition, event, market, selection,
      bookmaker, entry_odds, minimum_odds, probability_own, probability_low,
      probability_high, stake_pct, stake_ars, thesis, principal_risk,
      odds_captured_at, event_start_at, status, published_at
    )
    values (
      v_matchday_id, 'CI-INVARIANT-LATE-CAPTURE', 'elite', 'football', 'TEST',
      'A vs B', 'Totals', 'Over', 'Bet365', 2.00, 1.80,
      0.60, 0.55, 0.65, 0.01, 1000,
      'Timing test', 'Late price capture',
      '2099-12-01T19:00:00-03:00',
      '2099-12-01T18:00:00-03:00',
      'published', now()
    );

    insert into maurilio_invariant_results
    values ('reject_capture_after_event', false, 'unexpected insert');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'reject_capture_after_event',
      position('maurilio_published_pick_requires_future_event_window' in sqlerrm) > 0,
      sqlerrm
    );
  end;
end $$;

do $$
begin
  begin
    update public.maurilio_picks
    set market='REWRITTEN'
    where public_id='CI-INVARIANT-FREE';

    insert into maurilio_invariant_results
    values ('immutable_pick', false, 'unexpected update');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'immutable_pick',
      sqlerrm='published_pick_is_immutable',
      sqlerrm
    );
  end;
end $$;

do $$
begin
  begin
    perform public.maurilio_publish_bundle(
      jsonb_build_object(
        'slug','2099-12-02',
        'match_date','2099-12-02',
        'label','BLOCKED',
        'no_value',true,
        'picks','[]'::jsonb
      )
    );

    insert into maurilio_invariant_results
    values ('block_next_while_open', false, 'unexpected publish');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'block_next_while_open',
      sqlerrm='previous_matchday_still_open',
      sqlerrm
    );
  end;
end $$;

do $$
begin
  begin
    perform public.maurilio_close_pick_sale(
      'CI-INVARIANT-FREE',
      'price_below_minimum',
      1.85
    );
    insert into maurilio_invariant_results
    values ('reject_price_stop_above_minimum', false, 'unexpected close');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'reject_price_stop_above_minimum',
      sqlerrm='observed_odds_not_below_minimum',
      sqlerrm
    );
  end;
end $$;

select public.maurilio_close_pick_sale(
  'CI-INVARIANT-FREE',
  'price_below_minimum',
  1.70
);

insert into maurilio_invariant_results
select
  'valid_price_risk_stop',
  sale_status='closed'
    and sale_closed_reason='price_below_minimum'
    and last_observed_odds=1.70,
  concat(
    'sale_status=',sale_status,
    ', reason=',sale_closed_reason,
    ', observed=',last_observed_odds
  )
from public.maurilio_picks
where public_id='CI-INVARIANT-FREE';

insert into maurilio_invariant_results
select
  'sale_stop_audited',
  exists(
    select 1 from public.maurilio_audit_events
    where event_type='sale_closed'
      and entity_id='CI-INVARIANT-FREE'
  ),
  'sale_closed audit event exists';

do $$
begin
  begin
    perform public.maurilio_close_pick_sale(
      'CI-INVARIANT-FREE',
      'manual_risk_stop',
      null
    );
    insert into maurilio_invariant_results
    values ('risk_stop_irreversible', false, 'unexpected second close');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'risk_stop_irreversible',
      sqlerrm='sale_already_closed',
      sqlerrm
    );
  end;
end $$;

do $$
begin
  begin
    update public.maurilio_picks
    set
      sale_status='open',
      sale_closed_reason=null,
      sale_closed_at=null,
      last_observed_odds=null,
      last_observed_at=null
    where public_id='CI-INVARIANT-FREE';

    insert into maurilio_invariant_results
    values ('risk_stop_db_immutable', false, 'unexpected reopen');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'risk_stop_db_immutable',
      sqlerrm='sale_stop_is_immutable',
      sqlerrm
    );
  end;
end $$;

select public.maurilio_settle_pick('CI-INVARIANT-FREE','win',1.90);

insert into maurilio_invariant_results
select
  'settlement_pnl',
  status='settled' and result='win' and pnl_ars=1000 and closing_odds=1.90,
  concat('status=',status,', pnl=',pnl_ars,', close=',closing_odds)
from public.maurilio_picks
where public_id='CI-INVARIANT-FREE';

insert into maurilio_invariant_results
select
  'settlement_audited',
  exists(
    select 1 from public.maurilio_audit_events
    where event_type='pick_settled'
      and entity_id='CI-INVARIANT-FREE'
  ),
  'pick_settled audit event exists';

do $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.maurilio_audit_events
  where entity_id='CI-INVARIANT-FREE'
  order by created_at asc
  limit 1;

  begin
    update public.maurilio_audit_events
    set event_type='tampered'
    where id=v_id;

    insert into maurilio_invariant_results
    values ('audit_append_only', false, 'unexpected update');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'audit_append_only',
      sqlerrm='audit_log_is_append_only',
      sqlerrm
    );
  end;
end $$;

do $$
begin
  begin
    perform public.maurilio_publish_bundle(
      jsonb_build_object(
        'slug','2099-12-02',
        'match_date','2099-12-02',
        'label','NO VALUE TEST',
        'no_value',true,
        'picks','[]'::jsonb
      )
    );

    insert into maurilio_invariant_results
    values ('allow_next_after_settle', true, 'published');
  exception when others then
    insert into maurilio_invariant_results
    values ('allow_next_after_settle', false, sqlerrm);
  end;
end $$;

insert into maurilio_invariant_results
select
  'risk_snapshot',
  (payload->>'bank_ars')::numeric = 101000
    and (payload->>'pnl_ars')::numeric = 1000
    and (payload->>'settled_count')::int = 1,
  payload::text
from (select public.maurilio_risk_snapshot() payload) s;

do $$
declare
  v_key text := repeat('a', 64);
  v_payload jsonb;
  i integer;
begin
  v_payload := public.maurilio_admin_login_gate(v_key, 'check');

  if coalesce((v_payload->>'allowed')::boolean, false) is not true
     or (v_payload->>'remaining')::int <> 5 then
    insert into maurilio_invariant_results
    values ('admin_throttle_initial', false, v_payload::text);
  else
    insert into maurilio_invariant_results
    values ('admin_throttle_initial', true, v_payload::text);
  end if;

  for i in 1..5 loop
    v_payload := public.maurilio_admin_login_gate(v_key, 'failure');
  end loop;

  insert into maurilio_invariant_results
  values (
    'admin_throttle_blocks',
    coalesce((v_payload->>'allowed')::boolean, true) is false
      and (v_payload->>'remaining')::int = 0
      and v_payload->>'blocked_until' is not null,
    v_payload::text
  );
end $$;

select * from maurilio_invariant_results order by test_name;

rollback;
