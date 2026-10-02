revoke execute on function public.maurilio_handle_new_auth_user() from anon, authenticated;
revoke execute on function public.maurilio_my_account() from anon;
revoke execute on function public.maurilio_my_tipster_dashboard() from anon;
revoke execute on function public.maurilio_upsert_tipster_profile(
  text,text,text,text[],text[],numeric
) from anon;
revoke execute on function public.maurilio_verify_settlement_secret(text)
  from anon, authenticated;

grant execute on function public.maurilio_my_account() to authenticated;
grant execute on function public.maurilio_my_tipster_dashboard() to authenticated;
grant execute on function public.maurilio_upsert_tipster_profile(
  text,text,text,text[],text[],numeric
) to authenticated;
grant execute on function public.maurilio_verify_settlement_secret(text)
  to service_role;

create index if not exists maurilio_tipster_subscriptions_tipster_idx
  on public.maurilio_tipster_subscriptions (tipster_id);
