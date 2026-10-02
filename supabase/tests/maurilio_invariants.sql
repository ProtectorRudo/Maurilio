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

do $$
begin
  begin
    perform public.maurilio_settle_pick(
      'CI-INVARIANT-FREE',
      'win',
      1.90
    );
    insert into maurilio_invariant_results
    values ('reject_premature_settlement', false, 'unexpected settlement');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'reject_premature_settlement',
      sqlerrm='event_not_started',
      sqlerrm
    );
  end;
end $$;

select public.maurilio_settle_pick(
  'CI-INVARIANT-FREE',
  'void',
  null
);

do $$
declare
  v_matchday_id uuid;
begin
  insert into public.maurilio_matchdays(
    slug, match_date, label, status, published_at
  )
  values(
    '2020-01-01-ci',
    '2020-01-01',
    'HISTORICAL SETTLEMENT TEST',
    'archived',
    '2020-01-01T12:00:00-03:00'
  )
  returning id into v_matchday_id;

  insert into public.maurilio_picks(
    matchday_id, public_id, tier, sport, competition, event, market, selection,
    bookmaker, entry_odds, minimum_odds, probability_own, probability_low,
    probability_high, stake_pct, stake_ars, thesis, principal_risk,
    odds_captured_at, event_start_at, status, published_at
  )
  values(
    v_matchday_id,
    'CI-INVARIANT-SETTLE',
    'free',
    'football',
    'TEST',
    'Historical A vs B',
    'Totals',
    'Over',
    'Bet365',
    2.00,
    1.80,
    0.60,
    0.55,
    0.65,
    0.01,
    1000,
    'Historical settlement thesis',
    'Historical settlement risk',
    '2020-01-01T11:00:00-03:00',
    '2020-01-01T18:00:00-03:00',
    'published',
    '2020-01-01T12:00:00-03:00'
  );
end $$;

select public.maurilio_settle_pick(
  'CI-INVARIANT-SETTLE',
  'win',
  1.90
);

insert into maurilio_invariant_results
select
  'settlement_pnl',
  status='settled' and result='win' and pnl_ars=1000 and closing_odds=1.90,
  concat('status=',status,', pnl=',pnl_ars,', close=',closing_odds)
from public.maurilio_picks
where public_id='CI-INVARIANT-SETTLE';

insert into maurilio_invariant_results
select
  'settlement_audited',
  exists(
    select 1 from public.maurilio_audit_events
    where event_type='pick_settled'
      and entity_id='CI-INVARIANT-SETTLE'
  ),
  'historical pick_settled audit event exists';

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
    and (payload->>'settled_count')::int = 2
    and (payload->>'roi')::numeric = 0.5,
  payload::text
from (select public.maurilio_risk_snapshot() payload) s;

do $$
declare
  v_subject uuid := '00000000-0000-4000-8000-000000000123'::uuid;
  v_order_id uuid;
  v_entitlement_id uuid;
  v_recovery jsonb;
begin
  insert into public.maurilio_orders(
    external_reference, subject_id, matchday_slug, tier, amount_ars, status, paid_at
  )
  values (
    'ci-entitlement-order', v_subject, '2099-12-01', 'pro', 1000, 'paid', now()
  )
  returning id into v_order_id;

  insert into public.maurilio_entitlements(
    subject_id, matchday_slug, tier, source_order_id, status
  )
  values (
    v_subject, '2099-12-01', 'pro', v_order_id, 'active'
  )
  returning id into v_entitlement_id;

  insert into maurilio_invariant_results
  select 'access_grant_audited',
    exists(
      select 1 from public.maurilio_audit_events
      where event_type='access_granted'
        and entity_id=v_entitlement_id::text
    ),
    'access_granted audit event exists';

  insert into maurilio_invariant_results
  select 'historical_entitlement_survives_settlement',
    exists(
      select 1 from public.maurilio_entitlements
      where id=v_entitlement_id and status='active'
    ),
    'active entitlement remains after Matchday settlement';

  perform public.maurilio_issue_recovery_code(
    v_subject,
    repeat('b', 64)
  );

  insert into maurilio_invariant_results
  select
    'recovery_hash_only',
    exists(
      select 1
      from public.maurilio_access_recovery_codes
      where subject_id=v_subject
        and token_hash=repeat('b',64)
        and expires_at > now()
    ),
    'only the digest is persisted with a future expiry';

  insert into maurilio_invariant_results
  select
    'recovery_issue_audited',
    exists(
      select 1
      from public.maurilio_audit_events
      where event_type='recovery_code_issued'
        and entity_id=v_subject::text
    ),
    'recovery_code_issued audit event exists';

  v_recovery := public.maurilio_consume_recovery_code(
    repeat('b', 64)
  );

  insert into maurilio_invariant_results
  values (
    'recovery_single_use_success',
    v_recovery->>'subject_id'=v_subject::text
      and (v_recovery->>'active_entitlements')::int = 1,
    v_recovery::text
  );

  insert into maurilio_invariant_results
  select
    'recovery_consumed_deleted',
    not exists(
      select 1
      from public.maurilio_access_recovery_codes
      where subject_id=v_subject
    ),
    'consumed recovery code row is deleted';

  insert into maurilio_invariant_results
  select
    'recovery_access_audited',
    exists(
      select 1
      from public.maurilio_audit_events
      where event_type='access_recovered'
        and entity_id=v_subject::text
    ),
    'access_recovered audit event exists';

  begin
    perform public.maurilio_consume_recovery_code(
      repeat('b', 64)
    );
    insert into maurilio_invariant_results
    values ('recovery_second_use_rejected', false, 'unexpected second consume');
  exception when others then
    insert into maurilio_invariant_results
    values (
      'recovery_second_use_rejected',
      sqlerrm='invalid_recovery_code',
      sqlerrm
    );
  end;

  update public.maurilio_entitlements
  set status='revoked', revoked_at=now()
  where id=v_entitlement_id;

  insert into maurilio_invariant_results
  select 'access_revoke_audited',
    exists(
      select 1 from public.maurilio_audit_events
      where event_type='access_revoked'
        and entity_id=v_entitlement_id::text
    ),
    'access_revoked audit event exists';

  insert into maurilio_invariant_results
  select 'revoked_entitlement_inactive',
    exists(
      select 1 from public.maurilio_entitlements
      where id=v_entitlement_id and status='revoked'
    ),
    'revoked entitlement is no longer active';
end $$;

do $$
declare
  v_subject uuid := '00000000-0000-4000-8000-000000000124'::uuid;
  v_first jsonb;
  v_second jsonb;
begin
  v_first := public.maurilio_reserve_order(
    'ci-reserve-first-0000000001',
    v_subject,
    '2099-12-02',
    'elite',
    1500
  );

  v_second := public.maurilio_reserve_order(
    'ci-reserve-second-000000001',
    v_subject,
    '2099-12-02',
    'elite',
    1500
  );

  insert into maurilio_invariant_results
  values (
    'checkout_first_reservation_new',
    coalesce((v_first->>'reused')::boolean, true) is false,
    v_first::text
  );

  insert into maurilio_invariant_results
  values (
    'checkout_second_reservation_reused',
    coalesce((v_second->>'reused')::boolean, false) is true
      and v_second->>'id' = v_first->>'id',
    v_second::text
  );

  insert into maurilio_invariant_results
  select
    'checkout_single_active_order',
    count(*) = 1,
    concat('active_orders=',count(*))
  from public.maurilio_orders
  where subject_id=v_subject
    and matchday_slug='2099-12-02'
    and tier='elite'
    and status in ('created','pending','processed');
end $$;

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
