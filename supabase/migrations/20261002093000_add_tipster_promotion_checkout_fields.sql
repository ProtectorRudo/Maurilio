alter table public.maurilio_tipster_promotions
  add column if not exists duration_days integer
    check (duration_days is null or duration_days in (3,7,14,30)),
  add column if not exists external_reference text unique,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists paid_at timestamptz;

create index if not exists maurilio_tipster_promotions_tipster_status_idx
  on public.maurilio_tipster_promotions (tipster_id, status, ends_at desc);
