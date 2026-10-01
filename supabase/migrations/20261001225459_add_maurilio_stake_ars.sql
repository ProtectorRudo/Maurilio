alter table public.maurilio_picks
  add column if not exists stake_ars numeric(14,2)
  check (stake_ars is null or stake_ars >= 0);
