# Maurilio — Production Launch Contract

Maurilio is intentionally **fail-closed**. A deployment can go live before payments are enabled.

## Public URL

The application is built with:

```
basePath: /maurilio
```

Target public URL:

```
https://viralio.net/maurilio
```

The Viralio production project should rewrite `/maurilio/:path*` to the Maurilio deployment **without stripping the Maurilio base path**.

## Required production variables

```env
NEXT_PUBLIC_SITE_URL=https://viralio.net/maurilio
MAURILIO_ADMIN_PREVIEW=0

MAURILIO_CHECKOUT_ENABLED=0
MAURILIO_PRO_PRICE_ARS=
MAURILIO_ELITE_PRICE_ARS=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
```

Never commit real credentials.

## Payment activation gate

Do not set `MAURILIO_CHECKOUT_ENABLED=1` until all of these are true:

1. PRO and ELITE prices are final.
2. Mercado Pago production credentials are configured server-side.
3. The production return URLs resolve correctly.
4. A persistent entitlement store exists.
5. Mercado Pago Order webhooks are configured and their signature is validated.
6. A paid order is independently fetched/verified server-side before access is granted.
7. Success/pending/failure paths were tested with test credentials.
8. Refund/revocation behavior is defined.

The return URL is **never** proof of payment.

## Current checkout behavior

- GET `/maurilio/api/checkout`: returns provider readiness and server-configured prices.
- POST `/maurilio/api/checkout`: remains unavailable unless the explicit checkout flag, a server Access Token, and valid prices are present.
- The client never chooses the authoritative amount.
- Each Mercado Pago order uses a unique idempotency key.
- Checkout return screens do not unlock premium content.

## Control Room

`/maurilio/control-room` returns 404 in production unless:

```env
MAURILIO_ADMIN_PREVIEW=1
```

This flag is for controlled preview only. Before real publishing actions are added, replace this with authenticated authorization.

## Database plan

Use an isolated Maurilio namespace/schema or dedicated tables. Minimum entities:

- matchdays
- picks
- orders
- entitlements
- ledger_entries

Requirements:

- immutable publication timestamp for picks
- server-stored Bet365 capture time and price
- order provider ID unique constraint
- idempotent webhook processing
- entitlement status independent of browser redirects
- audit trail for result, closing price and CLV
- row-level authorization for any exposed tables

## Release gate

Every main-branch release must pass:

```
npm run typecheck
npm run build
```

The GitHub Actions workflow enforces both.
