alter table public.maurilio_tipster_tips
  add column if not exists settlement_rule text
    check (settlement_rule is null or settlement_rule in ('moneyline','handicap','total')),
  add column if not exists settlement_capture jsonb,
  add column if not exists settlement_verified_at timestamptz;

create table if not exists public.maurilio_internal_runtime (
  key text primary key,
  value_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.maurilio_internal_runtime enable row level security;
revoke all on table public.maurilio_internal_runtime from anon, authenticated;

create or replace function public.maurilio_verify_settlement_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.maurilio_internal_runtime
    where key = 'settlement_secret'
      and value_hash = encode(extensions.digest(coalesce(p_secret,''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.maurilio_verify_settlement_secret(text) from public;
grant execute on function public.maurilio_verify_settlement_secret(text) to service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- Production bootstraps the random settlement secret and project invocation
-- values in Supabase Vault outside source control before scheduling the job.
