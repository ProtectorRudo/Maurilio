import type { Metadata } from "next";
import { cookies } from "next/headers";
import AccessRecovery from "@/components/AccessRecovery";
import {
  databaseConfigured,
  getActiveEntitlements,
  getMatchdayBySlug,
} from "@/lib/server/supabase-rest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis informes — Maurilio",
  robots: { index: false, follow: false },
};

const ACCESS_COOKIE = "maurilio_sid";

function validUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return (
    new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date) + " ART"
  );
}

export default async function AccessLibraryPage() {
  const store = await cookies();
  const subjectId = store.get(ACCESS_COOKIE)?.value;

  let activeEntitlementCount = 0;
  let reports: Array<{
    id: string;
    tier: "pro" | "elite";
    matchday: string;
    label: string;
    status: string;
    grantedAt: string;
  }> = [];

  if (databaseConfigured() && validUuid(subjectId)) {
    try {
      const entitlements = await getActiveEntitlements(subjectId!);
      activeEntitlementCount = entitlements.length;
      const uniqueSlugs = [...new Set(entitlements.map((item) => item.matchday_slug))];
      const matchdays = await Promise.all(
        uniqueSlugs.map(async (slug) => [
          slug,
          await getMatchdayBySlug(slug).catch(() => null),
        ] as const),
      );
      const bySlug = new Map(matchdays);

      reports = entitlements.map((item) => ({
        id: item.id,
        tier: item.tier,
        matchday: item.matchday_slug,
        label: bySlug.get(item.matchday_slug)?.label ?? item.matchday_slug,
        status: bySlug.get(item.matchday_slug)?.status ?? "unknown",
        grantedAt: item.granted_at,
      }));
    } catch {
      reports = [];
    }
  }

  return (
    <main className="access-library-page">
      <header className="subpage-nav">
        <a className="brand" href="/maurilio">
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>MY REPORTS</small></span>
        </a>
        <nav className="nav-links" aria-label="Mis informes">
          <a href="/maurilio/integrity">Integridad</a>
          <a href="/maurilio/archive">Registro</a>
          <a href="/maurilio">Matchday</a>
        </nav>
      </header>

      <section className="access-library-hero">
        <span className="section-kicker">ENTITLEMENT LIBRARY</span>
        <h1>Mis informes</h1>
        <p>
          Los informes acreditados permanecen asociados a este acceso y pueden
          revisarse incluso después de liquidado el Matchday.
        </p>
      </section>

      <section className="access-library-list">
        {reports.length === 0 ? (
          <div className="access-empty">
            <span>NO VERIFIED REPORTS</span>
            <h2>No hay informes premium disponibles en este acceso.</h2>
            <p>
              Si la compra fue acreditada en otro navegador o dispositivo,
              ingresá abajo el Recovery Code generado desde ese acceso.
            </p>
            <a className="primary-button" href="/maurilio">Volver al Matchday</a>
          </div>
        ) : (
          reports.map((report) => {
            const query = new URLSearchParams({
              matchday: report.matchday,
              tier: report.tier,
            }).toString();

            return (
              <article className="access-report-card" key={report.id}>
                <div className="access-report-tier">
                  <span>{report.tier.toUpperCase()}</span>
                  <b>ACCESS VERIFIED</b>
                </div>
                <h2>{report.label}</h2>
                <div className="access-report-meta">
                  <span>Matchday {report.matchday}</span>
                  <span>Estado {report.status.toUpperCase()}</span>
                  <span>Acceso {dateTime(report.grantedAt)}</span>
                </div>
                <a
                  className="primary-button"
                  href={`/maurilio/access/report?${query}`}
                >
                  Abrir informe →
                </a>
              </article>
            );
          })
        )}
      </section>

      <AccessRecovery hasAccess={activeEntitlementCount > 0} />
    </main>
  );
}
