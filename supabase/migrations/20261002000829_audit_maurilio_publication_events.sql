create or replace function public.maurilio_audit_matchday_publication()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status='published' and new.published_at is not null then
    insert into public.maurilio_audit_events(event_type,entity_type,entity_id,payload)
    values ('matchday_published','matchday',new.slug,jsonb_build_object(
      'match_date',new.match_date,'label',new.label,'no_value',new.no_value,'published_at',new.published_at
    ));
  end if;
  return new;
end;
$$;

create or replace function public.maurilio_audit_pick_publication()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status='published' and new.published_at is not null then
    insert into public.maurilio_audit_events(event_type,entity_type,entity_id,payload)
    values ('pick_published','pick',new.public_id,jsonb_build_object(
      'tier',new.tier,'event',new.event,'market',new.market,'selection',new.selection,
      'bookmaker',new.bookmaker,'entry_odds',new.entry_odds,'minimum_odds',new.minimum_odds,
      'probability_own',new.probability_own,'probability_low',new.probability_low,
      'probability_high',new.probability_high,'stake_pct',new.stake_pct,'stake_ars',new.stake_ars,
      'odds_captured_at',new.odds_captured_at,'event_start_at',new.event_start_at,'published_at',new.published_at
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists maurilio_audit_matchday_publication_trigger on public.maurilio_matchdays;
create trigger maurilio_audit_matchday_publication_trigger
after insert on public.maurilio_matchdays
for each row execute function public.maurilio_audit_matchday_publication();

drop trigger if exists maurilio_audit_pick_publication_trigger on public.maurilio_picks;
create trigger maurilio_audit_pick_publication_trigger
after insert on public.maurilio_picks
for each row execute function public.maurilio_audit_pick_publication();

revoke all on function public.maurilio_audit_matchday_publication() from public, anon, authenticated;
revoke all on function public.maurilio_audit_pick_publication() from public, anon, authenticated;
