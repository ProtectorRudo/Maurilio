
create index if not exists maurilio_marketplace_admin_events_admin_created_idx
  on public.maurilio_marketplace_admin_events (admin_user_id, created_at desc);
