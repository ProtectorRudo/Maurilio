drop index if exists public.maurilio_tipster_provider_pick_unique;

create unique index maurilio_tipster_provider_pick_unique
  on public.maurilio_tipster_tips (
    tipster_id,
    provider_event_id,
    provider_selection_key
  )
  where provider_event_id is not null
    and provider_selection_key is not null;
