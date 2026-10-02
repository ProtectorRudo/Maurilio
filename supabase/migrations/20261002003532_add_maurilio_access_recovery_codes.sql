create table if not exists public.maurilio_access_recovery_codes (
  subject_id uuid primary key,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table public.maurilio_access_recovery_codes enable row level security;
revoke all on table public.maurilio_access_recovery_codes from anon, authenticated;
grant select, insert, update, delete on table public.maurilio_access_recovery_codes to service_role;

create or replace function public.maurilio_issue_recovery_code(
  p_subject_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expires timestamptz := now() + interval '7 days';
begin
  if p_subject_id is null then raise exception 'subject_required'; end if;
  if p_token_hash is null or length(trim(p_token_hash)) <> 64 then
    raise exception 'invalid_recovery_hash';
  end if;

  if not exists (
    select 1
    from public.maurilio_entitlements
    where subject_id = p_subject_id
      and status = 'active'
      and (expires_at is null or expires_at > v_now)
  ) then
    raise exception 'no_active_entitlements';
  end if;

  insert into public.maurilio_access_recovery_codes(
    subject_id, token_hash, issued_at, expires_at
  )
  values(p_subject_id, p_token_hash, v_now, v_expires)
  on conflict (subject_id) do update
  set token_hash = excluded.token_hash,
      issued_at = excluded.issued_at,
      expires_at = excluded.expires_at;

  insert into public.maurilio_audit_events(
    event_type, entity_type, entity_id, payload
  ) values (
    'recovery_code_issued',
    'subject',
    p_subject_id::text,
    jsonb_build_object(
      'issued_at', v_now,
      'expires_at', v_expires
    )
  );

  return jsonb_build_object(
    'issued_at', v_now,
    'expires_at', v_expires
  );
end;
$$;

create or replace function public.maurilio_consume_recovery_code(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.maurilio_access_recovery_codes%rowtype;
  v_now timestamptz := now();
  v_count integer;
begin
  if p_token_hash is null or length(trim(p_token_hash)) <> 64 then
    raise exception 'invalid_recovery_code';
  end if;

  select *
  into v_row
  from public.maurilio_access_recovery_codes
  where token_hash = p_token_hash
  for update;

  if not found then raise exception 'invalid_recovery_code'; end if;

  if v_row.expires_at <= v_now then
    delete from public.maurilio_access_recovery_codes
    where subject_id = v_row.subject_id;
    raise exception 'recovery_code_expired';
  end if;

  select count(*)
  into v_count
  from public.maurilio_entitlements
  where subject_id = v_row.subject_id
    and status = 'active'
    and (expires_at is null or expires_at > v_now);

  if v_count < 1 then
    delete from public.maurilio_access_recovery_codes
    where subject_id = v_row.subject_id;
    raise exception 'recovery_access_unavailable';
  end if;

  delete from public.maurilio_access_recovery_codes
  where subject_id = v_row.subject_id;

  insert into public.maurilio_audit_events(
    event_type, entity_type, entity_id, payload
  ) values (
    'access_recovered',
    'subject',
    v_row.subject_id::text,
    jsonb_build_object(
      'recovered_at', v_now,
      'active_entitlements', v_count
    )
  );

  return jsonb_build_object(
    'subject_id', v_row.subject_id,
    'active_entitlements', v_count
  );
end;
$$;

revoke all on function public.maurilio_issue_recovery_code(uuid,text)
  from public, anon, authenticated;
revoke all on function public.maurilio_consume_recovery_code(text)
  from public, anon, authenticated;

grant execute on function public.maurilio_issue_recovery_code(uuid,text)
  to service_role;
grant execute on function public.maurilio_consume_recovery_code(text)
  to service_role;
