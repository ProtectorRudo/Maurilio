
alter table public.maurilio_tipster_subscriptions
  drop constraint if exists maurilio_tipster_subscriptions_active_period_check;

alter table public.maurilio_tipster_subscriptions
  add constraint maurilio_tipster_subscriptions_active_period_check
  check (
    status <> 'active'
    or (
      current_period_end is not null
      and current_period_end > started_at
    )
  );
