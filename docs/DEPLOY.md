# Maurilio — Vercel Deployment

Maurilio deploys independently and is later exposed through `viralio.net/maurilio`.

## Deployment workflow

The repository contains:

```
.github/workflows/deploy.yml
```

Two safe paths exist:

- manual `workflow_dispatch` with `target=preview` or `target=production`;
- pushes to the dedicated `preview` branch, which can deploy **preview only**.

Production requires the explicit confirmation:

```
DEPLOY_PRODUCTION
```

## Required GitHub secrets

```
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

The deployment gate fails before checkout/build/deploy when any are missing.

## Preview environment

At minimum configure:

```env
NEXT_PUBLIC_SITE_URL=<preview-or-approved-site-url>

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=<server-only-secret>
SUPABASE_ANON_KEY=<publishable/legacy-compatible-key>

MAURILIO_SPLIT_PAYMENTS_ENABLED=0
MAURILIO_TOKEN_ENCRYPTION_KEY=<strong-random-server-secret>
MAURILIO_PROMOTIONS_ENABLED=0

MERCADOPAGO_CLIENT_ID=
MERCADOPAGO_CLIENT_SECRET=
MERCADOPAGO_WEBHOOK_SECRET=
ODDS_API_KEY=
```

Preview can run with Split payments disabled. The commission is not an environment variable; it is configured from Maurilio Admin and audited in Supabase.

The Mercado Pago OAuth / Split secrets are consumed by Supabase Edge Functions. Configure the same production values in Supabase Edge Function secrets before enabling real payments.

## Workflow sequence

1. validate Vercel secrets;
2. checkout repository;
3. install pinned Vercel CLI;
4. pull Vercel environment;
5. build the prebuilt artifact;
6. deploy preview/production according to the gate;
7. request `/maurilio/api/health`;
8. fail the workflow if health fails.

## Production

Manual workflow input:

```
target = production
production_confirmation = DEPLOY_PRODUCTION
```

Production is never triggered by the `preview` branch.

## Viralio integration

After the standalone Maurilio deployment is verified, set on the Viralio project:

```env
MAURILIO_ORIGIN=https://<verified-maurilio-deployment-origin>
```

Use a bare HTTPS origin. Viralio's rewrite must preserve Maurilio's `/maurilio` base path.

If the origin is missing or invalid, Viralio should fail closed and keep the rest of `viralio.net` unaffected.

## Current blocker

The deploy workflow is still fail-closed. It cannot create a browser preview until these repository secrets are configured:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

No production deployment was attempted.
