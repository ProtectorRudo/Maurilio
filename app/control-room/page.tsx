import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import AdminLogin from "@/components/AdminLogin";
import ControlRoom from "@/components/ControlRoom";
import SettlementPanel from "@/components/SettlementPanel";
import SaleRiskPanel from "@/components/SaleRiskPanel";
import AuditTimeline from "@/components/AuditTimeline";
import {
  ADMIN_COOKIE,
  adminConfigured,
  verifyAdminSession,
} from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Control Room — Maurilio",
  robots: { index: false, follow: false },
};

export default async function ControlRoomPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MAURILIO_ADMIN_PREVIEW !== "1" &&
    !adminConfigured()
  ) {
    notFound();
  }

  const cookieStore = await cookies();
  const authorized = verifyAdminSession(cookieStore.get(ADMIN_COOKIE)?.value);

  if (!authorized) {
    if (!adminConfigured()) {
      if (process.env.NODE_ENV === "production") notFound();
      return <AdminLogin />;
    }
    return <AdminLogin />;
  }

  return (
    <main className="control-page">
      <header className="subpage-nav">
        <a className="brand" href="/maurilio">
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>CONTROL ROOM</small></span>
        </a>
        <span className="status-pill">ADMIN VERIFIED</span>
      </header>
      <section className="control-hero">
        <div>
          <span className="section-kicker">OPERATIONS</span>
          <h1>Control Room</h1>
        </div>
        <p>
          Carga, valida y publica Matchdays. La publicación premium sólo existe
          cuando el informe supera los controles cuantitativos.
        </p>
      </section>
      <ControlRoom />
      <SaleRiskPanel />
      <SettlementPanel />
      <AuditTimeline />
    </main>
  );
}
