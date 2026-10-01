alter table public.maurilio_picks
  add constraint maurilio_published_pick_requires_positive_lower_ev
  check (
    status <> 'published'
    or (
      entry_odds is not null
      and probability_low is not null
      and (probability_low * entry_odds) > 1
    )
  )
  not valid;

alter table public.maurilio_picks
  validate constraint maurilio_published_pick_requires_positive_lower_ev;
