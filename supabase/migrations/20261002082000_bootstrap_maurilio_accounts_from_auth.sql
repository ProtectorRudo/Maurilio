create or replace function public.maurilio_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
  requested_name text;
begin
  requested_role := case
    when new.raw_user_meta_data->>'maurilio_role' = 'tipster' then 'tipster'
    else 'user'
  end;

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
    requested_role,
    requested_name,
    now(),
    now()
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_maurilio_auth_user_created on auth.users;
create trigger on_maurilio_auth_user_created
after insert on auth.users
for each row execute function public.maurilio_handle_new_auth_user();
