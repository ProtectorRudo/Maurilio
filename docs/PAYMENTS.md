# Maurilio — Mercado Pago production activation

Checkout and webhook logic are deployed as Supabase Edge Functions but remain
fail-closed until the required secrets are configured.

## Edge Functions

- Checkout:
  `maurilio-checkout`
- Mercado Pago webhook:
  `maurilio-mercadopago-webhook`

Webhook URL to register in Mercado Pago:

`https://bwsgxpttnrctklrcjmjs.supabase.co/functions/v1/maurilio-mercadopago-webhook`

The webhook function intentionally has JWT verification disabled because Mercado
Pago cannot send a Supabase JWT. It implements its own HMAC verification using
the Mercado Pago webhook secret before processing any order.

## Required Supabase Edge secrets

Do not put these values in source control.

- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `MAURILIO_PRO_PRICE_ARS`
- `MAURILIO_ELITE_PRICE_ARS`
- `MAURILIO_SITE_URL=https://viralio.net/maurilio`
- `MAURILIO_CHECKOUT_ENABLED=1` — **set this last**

Hosted Supabase Edge Functions already receive Supabase server credentials from
the platform. No service-role secret is committed to Viralio.

## Activation order

1. Keep `MAURILIO_CHECKOUT_ENABLED` unset or `0`.
2. Configure the Mercado Pago access token.
3. Configure PRO and ELITE ARS prices.
4. Configure the Mercado Pago webhook secret.
5. Register the webhook URL above in Mercado Pago.
6. Confirm the webhook subscribes to order events.
7. Confirm `GET /maurilio/api/checkout` still reports checkout disabled.
8. Publish a real Matchday with a future PRO or ELITE pick and open sale state.
9. Enable `MAURILIO_CHECKOUT_ENABLED=1`.
10. Confirm checkout status shows the correct price and availability.
11. Make one controlled payment.
12. Verify:
    - exactly one local order exists;
    - Mercado Pago amount equals the local amount;
    - webhook event is recorded;
    - entitlement is granted only after provider accreditation;
    - the browser returns with the same HttpOnly `maurilio_sid`;
    - payment success shows `Patear para revelar`;
    - the premium payload is requested only after the penalty kick;
    - `Mis informes` contains the purchased Matchday/tier.

## Payment flow

`Locker → Checkout → Mercado Pago → signed webhook → entitlement → return page → penalty → premium API → analysis`

The browser return URL never grants access by itself. Only the signed webhook,
followed by a provider-side order lookup and amount/external-reference
verification, can grant an entitlement.

## Idempotency

Postgres enforces one active checkout reservation per:

`subject_id + matchday_slug + tier`

Repeated clicks reuse the active reservation rather than creating parallel
orders.

## Refunds and failures

Provider states mapped to refunded, cancelled or failed revoke the entitlement.
The historical access library therefore also loses access after revocation.

## Emergency stop

To stop new sales without changing code:

1. Set `MAURILIO_CHECKOUT_ENABLED=0` or remove it.
2. Existing entitlements remain readable.
3. Webhook processing should stay online so already-created payments can finish
   and refunds can revoke access correctly.

To stop only one pick, use Maurilio's irreversible sale risk stop. Do not disable
the webhook to stop a market.

## Secret handling

Never paste production access tokens or webhook secrets into chat, Git, public
issues, screenshots or frontend environment variables. Configure them only in
the Supabase project's Edge Function secret store.
