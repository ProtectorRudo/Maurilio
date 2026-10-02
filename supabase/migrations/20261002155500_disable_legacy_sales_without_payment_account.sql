update public.maurilio_tipsters t
set accepting_subscribers = false,
    updated_at = now()
where accepting_subscribers = true
  and not exists (
    select 1
    from public.maurilio_tipster_payment_accounts a
    where a.tipster_id = t.id
      and a.revoked_at is null
  );
