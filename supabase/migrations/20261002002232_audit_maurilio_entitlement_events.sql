create or replace function public.maurilio_audit_entitlement_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    v_event := 'access_granted';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'active' then
      v_event := 'access_granted';
    elsif new.status in ('revoked','expired') then
      v_event := 'access_revoked';
    end if;
  end if;

  if v_event is not null then
    insert into public.maurilio_audit_events(
      event_type, entity_type, entity_id, payload
    ) values (
      v_event,
      'entitlement',
      new.id::text,
      jsonb_build_object(
        'matchday_slug', new.matchday_slug,
        'tier', new.tier,
        'source_order_id', new.source_order_id,
        'status', new.status,
        'granted_at', new.granted_at,
        'revoked_at', new.revoked_at,
        'expires_at', new.expires_at
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists maurilio_audit_entitlement_change_trigger
  on public.maurilio_entitlements;

create trigger maurilio_audit_entitlement_change_trigger
after insert or update on public.maurilio_entitlements
for each row
execute function public.maurilio_audit_entitlement_change();

revoke all on function public.maurilio_audit_entitlement_change()
  from public, anon, authenticated;
