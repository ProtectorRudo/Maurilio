# Maurilio Bet

Experiencia web y sistema operativo para **Maurilio — Quant Football**.

## Filosofía

No vendemos certezas. Buscamos discrepancias entre probabilidad estimada y precio
Bet365, con gestión de riesgo, publicación inmutable y registro auditable.

## Stack

- Next.js App Router
- React
- TypeScript
- Supabase/PostgreSQL
- Mercado Pago Orders
- CSS nativo

## Desarrollo

```bash
npm install
npm run dev
```

## Estado actual

Implementado:

- Home premium y Matchday
- FREE reveal interactivo
- PRO / ELITE protegidos por entitlement
- Biblioteca “Mis informes” con acceso histórico exacto por Matchday/tier
- Recovery Code single-use para recuperar compras en otro dispositivo sin cuentas ni email
- Checkout Mercado Pago fail-closed
- Webhook firmado + verificación independiente de order
- Supabase con RLS y acceso server-only
- Control Room autenticado + throttling distribuido
- Audit Timeline append-only
- Página pública Integrity / Proof of Process
- Publicación atómica de Matchdays
- Jornada NO VALUE
- Inmutabilidad de predicciones publicadas
- Gestión de banca y límites 2% / 6%
- Liquidación WIN / LOSS / PUSH / VOID
- P&L calculado por servidor
- CLV Bet365
- Ledger público real
- Healthcheck de producción
- Reverse proxy preparado para `viralio.net/maurilio`
- Deploy manual guardado + smoke-test de producción

En producción, los datos demo **nunca** se muestran como señal real cuando la base
está configurada.

## Operación

Ver:

- [Daily Operations Runbook](docs/OPERATIONS.md)
- [Production Launch Contract](docs/LAUNCH.md)
- [Vercel Deployment](docs/DEPLOY.md)
- [Database migrations & invariant tests](supabase/README.md)

## Release gate

Cada cambio en `main` debe pasar:

```bash
npm run typecheck
npm run build
```
