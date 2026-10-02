# Maurilio — Production Launch Contract

Maurilio is a marketplace of **tipsters + paid access** under:

```
https://viralio.net/maurilio
```

The Next.js app keeps:

```
basePath: /maurilio
```

Viralio must proxy `/maurilio` and `/maurilio/:path*` to the verified Maurilio origin without stripping the base path.

## Product contract

Launch only if these rules remain true:

- settled tipster history is public;
- future tips are visible only to users with paid access;
- entry odds are captured from Bet365, never typed manually by the tipster;
- published tips are immutable;
- closing odds / CLV are stored when available;
- advertising changes visibility only, never performance metrics;
- a tipster must connect their own Mercado Pago seller account before accepting paid access;
- buyer payments are processed through Mercado Pago Split Payments 1:1;
- Maurilio does not custody tipster sale proceeds;
- Maurilio receives only its marketplace commission;
- each approved payment unlocks 30 days of access;
- renewal is manual until recurring marketplace split is officially supported/documented;
- suspended tipsters cannot accept new paid access.

## Required app variables

```env
NEXT_PUBLIC_SITE_URL=https://viralio.net/maurilio

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret>
SUPABASE_ANON_KEY=<publishable/legacy-compatible-key>

MAURILIO_SITE_URL=https://viralio.net/maurilio
MAURILIO_PLATFORM_FEE_BPS=<1..5000>
MAURILIO_SPLIT_PAYMENTS_ENABLED=0
MAURILIO_TOKEN_ENCRYPTION_KEY=<strong-random-server-secret>

MERCADOPAGO_CLIENT_ID=
MERCADOPAGO_CLIENT_SECRET=
MERCADOPAGO_WEBHOOK_SECRET=

MAURILIO_PROMOTIONS_ENABLED=0
MAURILIO_PROMOTION_DAILY_PRICE_ARS=

ODDS_API_KEY=
```

Never commit credentials.

## Mercado Pago setup

Create a Mercado Pago application using the **Marketplace** model and configure:

- OAuth redirect URL:
  `https://viralio.net/maurilio/conectar-mercadopago`
- payment Webhook:
  `https://<supabase-project>.supabase.co/functions/v1/maurilio-subscription-webhook`
- payment topic enabled for production;
- production seller accounts with the identification level required by Mercado Pago.

Each tipster authorizes Maurilio through OAuth. Seller access/refresh tokens are encrypted server-side before storage.

## Release gate

Every release must pass:

```
npm run typecheck
npm run build
```

## Smoke test before enabling money

Keep `MAURILIO_SPLIT_PAYMENTS_ENABLED=0` until all are true:

1. registration/login/password recovery works;
2. a user can create a tipster profile;
3. the tipster can connect their Mercado Pago account through OAuth;
4. a tipster without Mercado Pago cannot activate paid access;
5. the public profile becomes purchasable only after the seller account is connected;
6. buyer checkout is created with the seller OAuth token;
7. Checkout Pro contains the configured `marketplace_fee`;
8. the payment collector is the tipster Mercado Pago account;
9. Maurilio receives only the marketplace fee;
10. payment webhook validates signature and seller collector;
11. an approved payment unlocks exactly 30 days;
12. duplicate webhooks do not extend access twice;
13. rejected payments do not unlock access;
14. refunded/charged-back payments revoke the related access;
15. the private feed blocks expired users;
16. Bet365 publishing and automatic settlement continue to pass;
17. admin can verify/suspend tipsters;
18. sponsored placement remains clearly labelled.

Only then set:

```
MAURILIO_SPLIT_PAYMENTS_ENABLED=1
```

## Health check

```
GET /maurilio/api/health
```

## Preview blocker

The Vercel preview workflow still requires:

```
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Without them no browser preview is created.

## Production cutover

1. verify the standalone Maurilio preview;
2. configure all production environment variables;
3. complete the Mercado Pago marketplace/OAuth configuration;
4. run test seller OAuth;
5. run a real low-value split payment test;
6. verify seller receipt and Maurilio marketplace fee;
7. verify Webhook access activation;
8. point Viralio's `MAURILIO_ORIGIN` at the verified deployment;
9. smoke test through `https://viralio.net/maurilio`;
10. enable split payments only after all checks pass.
