# Maurilio — Vercel Deployment

Deployment is intentionally manual and guarded.

The repository contains:

```
.github/workflows/deploy.yml
```

It runs only through GitHub Actions → **Deploy Maurilio** → **Run workflow**.

## Required GitHub secrets

Configure these repository secrets before the workflow can deploy:

```
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

No Vercel credential belongs in source control.

The workflow uses a pinned Vercel CLI version (`59.19.1`). At the time the
workflow was created, npm reported the Vercel CLI 59.x line as current.

## Required Vercel runtime variables

Configure these inside the Maurilio Vercel project for Preview and/or Production
as appropriate:

```env
NEXT_PUBLIC_SITE_URL=https://viralio.net/maurilio

MAURILIO_ADMIN_PREVIEW=0
MAURILIO_ADMIN_SECRET=<server-only-secret>

SUPABASE_URL=https://bwsgxpttnrctklrcjmjs.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret>

MAURILIO_CHECKOUT_ENABLED=0
MAURILIO_PRO_PRICE_ARS=
MAURILIO_ELITE_PRICE_ARS=

MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
```

Keep `MAURILIO_CHECKOUT_ENABLED=0` during deployment and smoke testing.

## Preview

Choose:

```
target = preview
```

The workflow:

1. verifies GitHub Vercel secrets exist;
2. pulls Preview configuration;
3. runs `vercel build`;
4. deploys the exact prebuilt artifact;
5. requests `/maurilio/api/health`;
6. fails if the health endpoint is not healthy.

## Production

Choose:

```
target = production
production_confirmation = DEPLOY_PRODUCTION
```

The explicit confirmation prevents accidental production deployment.

Production uses:

```
vercel build --prod
vercel deploy --prebuilt --prod
```

The workflow then checks:

```
<deployment-origin>/maurilio/api/health
```

A deployment is not considered healthy unless the database is reachable.

## Viralio integration

After a Maurilio deployment is verified, set this in the **Viralio** production
project:

```env
MAURILIO_ORIGIN=https://<verified-maurilio-deployment-origin>
```

Use only the bare HTTPS origin, without `/maurilio` and without a trailing slash.

Viralio already contains fail-closed rewrites:

```
/maurilio
/maurilio/:path*
```

They preserve Maurilio's `basePath: /maurilio`.

If `MAURILIO_ORIGIN` is absent or invalid, Viralio does not proxy Maurilio.

## Mercado Pago webhook

Only after the public Viralio path is verified, configure the Mercado Pago Order
webhook target:

```
https://viralio.net/maurilio/api/webhooks/mercadopago
```

Test with non-production payment credentials first.

## Checkout activation

Do not turn checkout on until all are true:

- public route works through Viralio;
- `/maurilio/api/health` is healthy;
- Control Room login works;
- a NO VALUE Matchday works;
- a test pick can be published and settled;
- premium endpoints reject users without entitlement;
- Mercado Pago webhook signature validation works;
- accredited test payment grants entitlement;
- refund/cancel revokes entitlement;
- PRO and ELITE prices are final.

Only then set:

```env
MAURILIO_CHECKOUT_ENABLED=1
```

## Current infrastructure limitation

The currently connected Vercel integration exposed no teams/projects during
setup, so no live deployment was created from this workspace. The GitHub workflow
exists so deployment can proceed without code changes once the three Vercel
GitHub secrets are configured.
