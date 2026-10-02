create table if not exists public.maurilio_admin_login_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.maurilio_admin_login_limits enable row level security;
revoke all on table public.maurilio_admin_login_limits from anon, authenticated;
grant select, insert, update, delete on table public.maurilio_admin_login_limits to service_role;

create or replace function public.maurilio_admin_login_gate(
  p_key_hash text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.maurilio_admin_login_limits%rowtype;
  v_now timestamptz := now();
  v_window interval := interval '15 minutes';
  v_block interval := interval '30 minutes';
  v_max_attempts integer := 5;
  v_remaining integer;
begin
  if p_key_hash is null or length(trim(p_key_hash)) < 32 then
    raise exception 'invalid_throttle_key';
  end if;

  if p_action not in ('check','failure','success') then
    raise exception 'invalid_throttle_action';
  end if;

  select * into v_row
  from public.maurilio_admin_login_limits
  where key_hash = p_key_hash
  for update;

  if not found then
    insert into public.maurilio_admin_login_limits(
      key_hash, window_started_at, failed_attempts, blocked_until, updated_at
    ) values (p_key_hash, v_now, 0, null, v_now)
    returning * into v_row;
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'blocked_until', v_row.blocked_until,
      'remaining', 0
    );
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until <= v_now then
    update public.maurilio_admin_login_limits
    set window_started_at=v_now, failed_attempts=0, blocked_until=null, updated_at=v_now
    where key_hash=p_key_hash
    returning * into v_row;
  end if;

  if v_row.window_started_at + v_window <= v_now then
    update public.maurilio_admin_login_limits
    set window_started_at=v_now, failed_attempts=0, blocked_until=null, updated_at=v_now
    where key_hash=p_key_hash
    returning * into v_row;
  end if;

  if p_action='success' then
    delete from public.maurilio_admin_login_limits where key_hash=p_key_hash;
    return jsonb_build_object('allowed',true,'blocked_until',null,'remaining',v_max_attempts);
  end if;

  if p_action='failure' then
    update public.maurilio_admin_login_limits
    set
      failed_attempts=failed_attempts+1,
      blocked_until=case
        when failed_attempts+1 >= v_max_attempts then v_now+v_block
        else null
      end,
      updated_at=v_now
    where key_hash=p_key_hash
    returning * into v_row;
  end if;

  v_remaining := greatest(v_max_attempts-v_row.failed_attempts,0);

  return jsonb_build_object(
    'allowed',v_row.blocked_until is null or v_row.blocked_until <= v_now,
    'blocked_until',v_row.blocked_until,
    'remaining',v_remaining
  );
end;
$$;

revoke all on function public.maurilio_admin_login_gate(text,text)
  from public, anon, authenticated;
grant execute on function public.maurilio_admin_login_gate(text,text)
  to service_role;
