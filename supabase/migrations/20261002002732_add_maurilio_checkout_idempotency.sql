create unique index if not exists maurilio_one_active_checkout_idx
  on public.maurilio_orders(subject_id, matchday_slug, tier)
  where status in ('created','pending','processed');

create or replace function public.maurilio_reserve_order(
  p_external_reference text,
  p_subject_id uuid,
  p_matchday_slug text,
  p_tier text,
  p_amount_ars numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.maurilio_orders%rowtype;
begin
  if p_external_reference is null or length(trim(p_external_reference)) < 16 then
    raise exception 'invalid_external_reference';
  end if;
  if p_subject_id is null then raise exception 'subject_required'; end if;
  if p_tier not in ('pro','elite') then raise exception 'invalid_tier'; end if;
  if p_amount_ars is null or p_amount_ars <= 0 then raise exception 'invalid_amount'; end if;

  select *
  into v_order
  from public.maurilio_orders
  where subject_id = p_subject_id
    and matchday_slug = p_matchday_slug
    and tier = p_tier
    and status in ('created','pending','processed')
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_order.status = 'created'
       and v_order.checkout_url is null
       and v_order.created_at < now() - interval '5 minutes' then
      update public.maurilio_orders
      set status='failed', updated_at=now()
      where id=v_order.id;
    else
      return jsonb_build_object(
        'reused', true,
        'id', v_order.id,
        'external_reference', v_order.external_reference,
        'provider_order_id', v_order.provider_order_id,
        'checkout_url', v_order.checkout_url,
        'status', v_order.status,
        'amount_ars', v_order.amount_ars
      );
    end if;
  end if;

  begin
    insert into public.maurilio_orders(
      external_reference,
      subject_id,
      matchday_slug,
      tier,
      amount_ars,
      status
    )
    values(
      p_external_reference,
      p_subject_id,
      p_matchday_slug,
      p_tier,
      p_amount_ars,
      'created'
    )
    returning * into v_order;
  exception when unique_violation then
    select *
    into v_order
    from public.maurilio_orders
    where subject_id = p_subject_id
      and matchday_slug = p_matchday_slug
      and tier = p_tier
      and status in ('created','pending','processed')
    order by created_at desc
    limit 1;

    if not found then raise; end if;

    return jsonb_build_object(
      'reused', true,
      'id', v_order.id,
      'external_reference', v_order.external_reference,
      'provider_order_id', v_order.provider_order_id,
      'checkout_url', v_order.checkout_url,
      'status', v_order.status,
      'amount_ars', v_order.amount_ars
    );
  end;

  return jsonb_build_object(
    'reused', false,
    'id', v_order.id,
    'external_reference', v_order.external_reference,
    'provider_order_id', v_order.provider_order_id,
    'checkout_url', v_order.checkout_url,
    'status', v_order.status,
    'amount_ars', v_order.amount_ars
  );
end;
$$;

revoke all on function public.maurilio_reserve_order(text,uuid,text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.maurilio_reserve_order(text,uuid,text,text,numeric)
  to service_role;
