alter table public.maurilio_tipster_subscriptions
  drop constraint if exists maurilio_tipster_subscriptions_status_check;

alter table public.maurilio_tipster_subscriptions
  add constraint maurilio_tipster_subscriptions_status_check
  check (status in ('pending','active','past_due','paused','cancelled','expired'));

drop index if exists public.maurilio_tipster_subscriptions_active_unique;

create unique index maurilio_tipster_subscriptions_active_unique
  on public.maurilio_tipster_subscriptions (subscriber_user_id, tipster_id)
  where status in ('pending','active','past_due','paused');
