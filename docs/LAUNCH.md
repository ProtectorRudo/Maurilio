# Maurilio — Production Launch Contract

Maurilio is a marketplace of **tipsters + subscribers** under:

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
- future tips are visible only to subscribers with active access;
- entry odds are captured from Bet365, never typed manually by the tipster;
- published tips are immutable;
- closing odds / CLV are stored when available;
- advertising changes visibility only, never performance metrics;
- subscription commission is frozen per subscription/payment;
- cancelled renewal does not remove access already paid for;
- suspended tipsters cannot accept new subscriptions;
- financial payouts are ledgered separately from subscription receipts.

## Required app variables

Server/runtime values:

```env
NEXT_PUBLIC_SITE_URL=https://viralio.net/maurilio

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret>
SUPABASE_ANON_KEY=<legacy-anon-or-publishable-compatible-key>

MAURILIO_PLATFORM_FEE_BPS=<1..5000>
MAURILIO_SUBSCRIPTIONS_ENABLED=0
MAURILIO_SITE_URL=https://viralio.net/maurilio

MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=

MAURILIO_PROMOTIONS_ENABLED=0
MAURILIO_PROMOTION_DAILY_PRICE_ARS=

ODDS_API_KEY=
```

Never commit credentials.

## Release gate

Every release must pass:

```
npm run typecheck
npm run build
```

GitHub Actions enforces both on `main`.

## First admin

Create a normal Maurilio account first, then promote that exact account manually in Supabase.
See `docs/ADMIN_BOOTSTRAP.md`.

Do not derive admin authorization from user metadata.

## Smoke test before enabling money

Keep subscriptions/promotions disabled until all are true:

1. registration works;
2. email confirmation returns to Maurilio;
3. login/logout works;
4. password recovery works;
5. a normal user can become a tipster;
6. the public profile appears only after a real owned profile exists;
7. the tipster studio loads Bet365 events and supported markets;
8. publishing revalidates Bet365 server-side and seals the tip;
9. subscriber checkout opens with the tipster's frozen monthly price and platform fee;
10. subscription webhook activates access;
11. future tip appears in `Mis tips`;
12. cancellation stops renewal but preserves current-period access;
13. automatic settlement resolves a test tip;
14. public history updates without exposing future selections;
15. tipster revenue dashboard reflects gross / commission / net;
16. payout request enters the admin queue and can be marked paid with a reference;
17. admin can verify, suspend and reactivate tipsters;
18. sponsored placement is visibly labelled and does not alter organic metrics.

Only then enable subscriptions/promotions.

## Health check

```
GET /maurilio/api/health
```

The endpoint is intentionally fail-closed and returns a degraded status when core database/auth configuration is unavailable.

## Current live blocker

Code, database migrations and CI are ready for preview deployment.

The preview workflow currently requires these GitHub secrets:

```
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Without them no Vercel preview can be created from GitHub Actions.

## Production cutover

After a preview is verified:

1. configure the Maurilio production Vercel environment;
2. deploy/promote the exact validated artifact;
3. verify `/maurilio/api/health`;
4. point Viralio's `MAURILIO_ORIGIN` at that deployment;
5. smoke test through `https://viralio.net/maurilio`;
6. configure production Mercado Pago webhook destinations;
7. enable subscriptions only after provider/webhook verification;
8. enable internal promotions only after promotion checkout verification.
