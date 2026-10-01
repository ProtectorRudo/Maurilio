alter table public.maurilio_picks
  add column if not exists event_start_at timestamptz;

alter table public.maurilio_picks
  add constraint maurilio_published_pick_requires_future_event_window
  check (
    status <> 'published'
    or (
      event_start_at is not null
      and odds_captured_at is not null
      and published_at is not null
      and odds_captured_at < event_start_at
      and published_at < event_start_at
    )
  )
  not valid;

alter table public.maurilio_picks
  validate constraint maurilio_published_pick_requires_future_event_window;

create or replace function public.maurilio_guard_published_pick()
returns trigger
language plpgsql
set search_path = public
as $$
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
  end if;

  return new;
end;
$$;

create or replace function public.maurilio_publish_bundle(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_label text;
  v_date date;
  v_no_value boolean;
  v_picks jsonb;
  v_matchday_id uuid;
  v_pick jsonb;
  v_entry numeric;
  v_minimum numeric;
  v_own numeric;
  v_low numeric;
  v_high numeric;
  v_stake numeric;
  v_stake_ars numeric;
  v_event_start timestamptz;
  v_capture timestamptz;
  v_tier text;
  v_public_id text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_slug := nullif(trim(payload->>'slug'), '');
  v_label := nullif(trim(payload->>'label'), '');
  v_date := nullif(payload->>'match_date', '')::date;
  v_no_value := coalesce((payload->>'no_value')::boolean, false);
  v_picks := coalesce(payload->'picks', '[]'::jsonb);

  if v_slug is null or v_label is null or v_date is null then
    raise exception 'missing_matchday_fields';
  end if;

  if jsonb_typeof(v_picks) <> 'array' then
    raise exception 'picks_must_be_array';
  end if;

  if exists (
    select 1
    from public.maurilio_matchdays
    where slug = v_slug
      and published_at is not null
  ) then
    raise exception 'matchday_already_published';
  end if;

  if v_no_value and jsonb_array_length(v_picks) > 0 then
    raise exception 'no_value_cannot_have_picks';
  end if;

  if not v_no_value and jsonb_array_length(v_picks) = 0 then
    raise exception 'published_matchday_requires_pick_or_no_value';
  end if;

  if exists (
    select 1
    from public.maurilio_matchdays m
    join public.maurilio_picks p on p.matchday_id = m.id
    where m.status = 'published'
      and m.slug <> v_slug
      and p.status = 'published'
  ) then
    raise exception 'previous_matchday_still_open';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_picks) x
    group by x->>'tier'
    having count(*) > 1
  ) then
    raise exception 'duplicate_tier';
  end if;

  if coalesce((
    select sum(nullif(x->>'stake_pct','')::numeric)
    from jsonb_array_elements(v_picks) x
  ), 0) > 0.06 then
    raise exception 'simultaneous_exposure_over_6pct';
  end if;

  update public.maurilio_matchdays
  set status = 'archived', updated_at = now()
  where status = 'published'
    and slug <> v_slug;

  insert into public.maurilio_matchdays (
    slug, match_date, label, status, no_value, published_at, updated_at
  )
  values (
    v_slug, v_date, v_label, 'published', v_no_value, now(), now()
  )
  returning id into v_matchday_id;

  if v_no_value then
    return v_matchday_id;
  end if;

  for v_pick in select value from jsonb_array_elements(v_picks)
  loop
    v_public_id := nullif(trim(v_pick->>'public_id'), '');
    v_tier := v_pick->>'tier';
    v_entry := nullif(v_pick->>'entry_odds', '')::numeric;
    v_minimum := nullif(v_pick->>'minimum_odds', '')::numeric;
    v_own := nullif(v_pick->>'probability_own', '')::numeric;
    v_low := nullif(v_pick->>'probability_low', '')::numeric;
    v_high := nullif(v_pick->>'probability_high', '')::numeric;
    v_stake := nullif(v_pick->>'stake_pct', '')::numeric;
    v_stake_ars := nullif(v_pick->>'stake_ars', '')::numeric;
    v_capture := nullif(v_pick->>'odds_captured_at','')::timestamptz;
    v_event_start := nullif(v_pick->>'event_start_at','')::timestamptz;

    if v_public_id is null then raise exception 'pick_public_id_required'; end if;
    if v_tier not in ('free','pro','elite') then raise exception 'invalid_tier'; end if;
    if coalesce(v_pick->>'bookmaker','') <> 'Bet365' then raise exception 'bookmaker_must_be_bet365'; end if;
    if v_entry is null or v_entry <= 1 then raise exception 'invalid_entry_odds'; end if;
    if v_minimum is null or v_minimum <= 1 then raise exception 'invalid_minimum_odds'; end if;
    if v_entry < v_minimum then raise exception 'entry_below_minimum'; end if;
    if v_own is null or v_own <= 0 or v_own >= 1 then raise exception 'invalid_probability'; end if;
    if v_low is null or v_high is null or v_low > v_own or v_high < v_own then raise exception 'invalid_probability_range'; end if;
    if v_low < 0 or v_high > 1 then raise exception 'invalid_probability_range'; end if;
    if v_stake is null or v_stake <= 0 or v_stake > 0.02 then raise exception 'invalid_stake'; end if;
    if v_stake_ars is null or v_stake_ars <= 0 then raise exception 'invalid_stake_ars'; end if;
    if (v_own * v_entry) - 1 <= 0 then raise exception 'non_positive_ev'; end if;
    if nullif(trim(v_pick->>'competition'),'') is null then raise exception 'competition_required'; end if;
    if nullif(trim(v_pick->>'event'),'') is null then raise exception 'event_required'; end if;
    if nullif(trim(v_pick->>'market'),'') is null then raise exception 'market_required'; end if;
    if nullif(trim(v_pick->>'thesis'),'') is null then raise exception 'thesis_required'; end if;
    if nullif(trim(v_pick->>'principal_risk'),'') is null then raise exception 'risk_required'; end if;
    if v_capture is null then raise exception 'capture_time_required'; end if;
    if v_event_start is null then raise exception 'event_start_required'; end if;
    if v_capture >= v_event_start then raise exception 'capture_must_precede_event'; end if;
    if v_event_start <= now() then raise exception 'event_already_started'; end if;

    insert into public.maurilio_picks (
      matchday_id, public_id, tier, sport, competition, event, market, selection,
      bookmaker, entry_odds, minimum_odds, probability_own, probability_low,
      probability_high, stake_pct, stake_ars, thesis, principal_risk,
      odds_captured_at, event_start_at, status, published_at, updated_at
    )
    values (
      v_matchday_id,
      v_public_id,
      v_tier,
      coalesce(nullif(trim(v_pick->>'sport'),''), 'football'),
      trim(v_pick->>'competition'),
      trim(v_pick->>'event'),
      trim(v_pick->>'market'),
      nullif(trim(v_pick->>'selection'),''),
      'Bet365',
      v_entry,
      v_minimum,
      v_own,
      v_low,
      v_high,
      v_stake,
      v_stake_ars,
      trim(v_pick->>'thesis'),
      trim(v_pick->>'principal_risk'),
      v_capture,
      v_event_start,
      'published',
      now(),
      now()
    );
  end loop;

  return v_matchday_id;
end;
$$;

revoke all on function public.maurilio_publish_bundle(jsonb)
  from public, anon, authenticated;
grant execute on function public.maurilio_publish_bundle(jsonb)
  to service_role;
