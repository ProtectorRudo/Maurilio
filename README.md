# Maurilio

Marketplace de **tipsters verificables + suscripciones** bajo `viralio.net/maurilio`.

## Producto

Maurilio separa reputación de marketing:

- el historial liquidado del tipster es público;
- los tips futuros quedan bloqueados para suscriptores;
- la cuota de entrada se registra desde Bet365, no se escribe a mano;
- los tips publicados son inmutables;
- resultados, P&L y CLV se liquidan desde evidencia registrada;
- la publicidad interna sólo compra visibilidad y nunca altera métricas;
- Maurilio cobra una comisión sobre cada suscripción procesada.

## Stack

- Next.js App Router
- React + TypeScript
- Supabase Auth / PostgreSQL / Edge Functions
- Mercado Pago
- Odds feed filtrado rígidamente a Bet365
- CSS Modules + CSS nativo

## Flujos implementados

### Usuario

- registro e ingreso;
- sesión HTTP-only;
- marketplace y búsqueda de tipsters;
- perfil público con historial real;
- compra de 30 días de acceso mediante Split de Pagos 1:1;
- `Mis suscripciones` con período de acceso y renovación manual;
- acceso vigente durante el período efectivamente abonado;
- `Mis tips` con feed privado.

### Tipster

- activación explícita y autenticada del rol;
- creación/edición de perfil y precio por 30 días;
- apertura/cierre de nuevas suscripciones;
- Estudio Bet365;
- publicación sólo desde líneas Bet365 vigentes;
- revalidación de cuota en servidor al publicar;
- publicación inmutable;
- liquidación automática de mercados soportados;
- captura de cuota de cierre / CLV;
- conexión OAuth de Mercado Pago y dashboard de ventas/comisión;
- compra de publicidad interna claramente marcada como `Patrocinado`.

### Backend y seguridad

- RLS y acceso de tablas restringido;
- webhooks separados para suscripciones y promociones;
- ledger de pagos y comisión sin custodia de fondos del tipster;
- settlement automático programado;
- Bet365 gateway restringido a tipsters/admin;
- rutas privadas `no-store` / `noindex`;
- reverse proxy aislado bajo `/maurilio` para no afectar el resto de Viralio.

## Desarrollo

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Las Edge Functions de Supabase viven bajo `supabase/functions` y no forman parte
del typecheck de Node/Next; usan el runtime Deno de Supabase.

## Deploy

El deploy de Maurilio es manual y fail-closed. Ver:

- [Vercel Deployment](docs/DEPLOY.md)
- [Production Launch Contract](docs/LAUNCH.md)
- [Database migrations](supabase/README.md)

No habilitar cobros de producción hasta completar el smoke test de registro,
publicación, conexión Mercado Pago, split checkout, webhook, feed privado y settlement.
