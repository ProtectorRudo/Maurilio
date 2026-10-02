import {
  databaseConfigured,
  databaseReachable,
  getLatestPublishedMatchday,
  getPublishedPickByTier,
  getRiskSnapshot,
} from "@/lib/server/supabase-rest";
import { adminConfigured } from "@/lib/server/admin-auth";
import {
  mercadoPagoConfigured,
  mercadoPagoWebhookConfigured,
} from "@/lib/server/mercadopago";

function validHttpsSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function price(name: "MAURILIO_PRO_PRICE_ARS" | "MAURILIO_ELITE_PRICE_ARS") {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function ars(value: number | null) {
  if (value === null) return "NO CONFIGURADO";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function Check({
  label,
  ok,
  detail,
  neutral = false,
}: {
  label: string;
  ok: boolean;
  detail: string;
  neutral?: boolean;
}) {
  return (
    <article className={`readiness-check ${ok ? "is-ok" : neutral ? "is-neutral" : "is-off"}`}>
      <span>{ok ? "✓" : neutral ? "•" : "×"}</span>
      <div>
        <b>{label}</b>
        <small>{detail}</small>
      </div>
    </article>
  );
}

export default async function LaunchReadiness() {
  const dbConfigured = databaseConfigured();
  const [dbReachable, active, risk] = dbConfigured
    ? await Promise.all([
        databaseReachable(),
        getLatestPublishedMatchday().catch(() => null),
        getRiskSnapshot().catch(() => null),
      ])
    : [false, null, null];

  let proAvailable = false;
  let eliteAvailable = false;

  if (active && !active.no_value) {
    const [pro, elite] = await Promise.all([
      getPublishedPickByTier(active.slug, "pro").catch(() => null),
      getPublishedPickByTier(active.slug, "elite").catch(() => null),
    ]);
    proAvailable = Boolean(pro);
    eliteAvailable = Boolean(elite);
  }

  const siteUrl = validHttpsSiteUrl();
  const proPrice = price("MAURILIO_PRO_PRICE_ARS");
  const elitePrice = price("MAURILIO_ELITE_PRICE_ARS");
  const adminReady = adminConfigured();
  const mpReady = mercadoPagoConfigured();
  const webhookReady = mercadoPagoWebhookConfigured();
  const checkoutSwitch = process.env.MAURILIO_CHECKOUT_ENABLED === "1";

  const infrastructureReady =
    dbConfigured && dbReachable && adminReady && Boolean(siteUrl);
  const paymentConfigReady =
    mpReady && webhookReady && proPrice !== null && elitePrice !== null;
  const premiumInventoryReady = proAvailable || eliteAvailable;
  const safeToArm =
    infrastructureReady && paymentConfigReady && premiumInventoryReady;

  return (
    <section className="readiness-panel">
      <div className="settlement-head">
        <div>
          <span className="section-kicker">PRODUCTION GATE</span>
          <h2>Launch Readiness</h2>
        </div>
        <span
          className={
            safeToArm
              ? "readiness-state ready"
              : "readiness-state waiting"
          }
        >
          {safeToArm ? "READY TO ARM" : "NOT READY"}
        </span>
      </div>

      <div className="readiness-grid">
        <Check
          label="SUPABASE"
          ok={dbConfigured && dbReachable}
          detail={
            !dbConfigured
              ? "Credenciales ausentes"
              : dbReachable
                ? "Configurado y reachable"
                : "Configurado pero no reachable"
          }
        />
        <Check
          label="ADMIN SECURITY"
          ok={adminReady}
          detail={adminReady ? "Secret + throttling listos" : "MAURILIO_ADMIN_SECRET ausente"}
        />
        <Check
          label="PUBLIC SITE URL"
          ok={Boolean(siteUrl)}
          detail={siteUrl ? `${siteUrl.host}${siteUrl.pathname}` : "HTTPS URL no configurada"}
        />
        <Check
          label="MERCADO PAGO"
          ok={mpReady}
          detail={mpReady ? "Access token configurado" : "Access token ausente"}
        />
        <Check
          label="WEBHOOK SIGNATURE"
          ok={webhookReady}
          detail={webhookReady ? "Secret configurado" : "Webhook secret ausente"}
        />
        <Check
          label="PRO PRICE"
          ok={proPrice !== null}
          detail={ars(proPrice)}
        />
        <Check
          label="ELITE PRICE"
          ok={elitePrice !== null}
          detail={ars(elitePrice)}
        />
        <Check
          label="MATCHDAY"
          ok={Boolean(active)}
          detail={
            active
              ? `${active.label} · ${active.no_value ? "NO VALUE" : "PUBLICADO"}`
              : "Sin Matchday publicado"
          }
        />
        <Check
          label="PREMIUM INVENTORY"
          ok={premiumInventoryReady}
          detail={
            premiumInventoryReady
              ? [proAvailable ? "PRO" : null, eliteAvailable ? "ELITE" : null]
                  .filter(Boolean)
                  .join(" + ")
              : active?.no_value
                ? "NO VALUE · correcto sin producto"
                : "Sin tier premium publicable"
          }
          neutral={Boolean(active?.no_value)}
        />
        <Check
          label="RISK SNAPSHOT"
          ok={Boolean(risk)}
          detail={
            risk
              ? `Banca ARS ${Number(risk.bank_ars).toLocaleString("es-AR")}`
              : "Snapshot no disponible"
          }
        />
        <Check
          label="CHECKOUT SWITCH"
          ok={checkoutSwitch}
          detail={
            checkoutSwitch
              ? "ARMED · cobros habilitados"
              : safeToArm
                ? "SAFE OFF · listo para habilitar"
                : "SAFE OFF"
          }
          neutral={!checkoutSwitch}
        />
      </div>

      <div className="readiness-summary">
        <div>
          <small>INFRAESTRUCTURA</small>
          <b>{infrastructureReady ? "READY" : "BLOCKED"}</b>
        </div>
        <div>
          <small>PAGOS</small>
          <b>{paymentConfigReady ? "CONFIGURED" : "INCOMPLETE"}</b>
        </div>
        <div>
          <small>CONTENIDO PREMIUM</small>
          <b>{premiumInventoryReady ? "AVAILABLE" : active?.no_value ? "NO VALUE" : "MISSING"}</b>
        </div>
        <div>
          <small>COBROS</small>
          <b>{checkoutSwitch ? "ON" : "OFF"}</b>
        </div>
      </div>

      <p className="control-footnote">
        READY TO ARM no habilita cobros por sí solo. El switch permanece separado
        para que deployment, smoke-test y webhook puedan verificarse con checkout
        todavía apagado.
      </p>
    </section>
  );
}
