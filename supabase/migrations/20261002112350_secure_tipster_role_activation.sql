create or replace function public.maurilio_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name','')), '');

  insert into public.maurilio_accounts (
    user_id,
    role,
    display_name,
    created_at,
    updated_at
  )
  values (
    new.id,
    'user',
    requested_name,
    now(),
    now()
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.maurilio_handle_new_auth_user() from public, anon, authenticated;

create or replace function public.maurilio_become_tipster()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  account_row public.maurilio_accounts%rowtype;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication_required';
  end if;

  update public.maurilio_accounts
  set
    role = case when role = 'admin' then 'admin' else 'tipster' end,
    updated_at = now()
  where user_id = uid
  returning * into account_row;

  if account_row.user_id is null then
    raise exception 'account_not_found';
  end if;

  return jsonb_build_object(
    'userId', account_row.user_id,
    'role', account_row.role,
    'displayName', account_row.display_name
  );
end;
$$;

revoke all on function public.maurilio_become_tipster() from public;
grant execute on function public.maurilio_become_tipster() to authenticated;
