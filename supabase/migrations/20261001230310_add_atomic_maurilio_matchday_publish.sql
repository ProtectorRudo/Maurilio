alter table public.maurilio_matchdays
  add column if not exists no_value boolean not null default false;

create unique index if not exists maurilio_single_published_matchday_idx
  on public.maurilio_matchdays ((1))
  where status = 'published';

-- The publication RPC is introduced here and hardened by later migrations
-- in this same migration chain. The canonical final definition lives in
-- 20261001231515_enforce_maurilio_publication_immutability.sql.
