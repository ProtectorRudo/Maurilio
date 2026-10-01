import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ControlRoom from "@/components/ControlRoom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Control Room — Maurilio",
  robots: { index: false, follow: false },
};

export default function ControlRoomPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MAURILIO_ADMIN_PREVIEW !== "1"
  ) {
    notFound();
  }

  return (
    <main className="control-page">
      <header className="subpage-nav">
        <a className="brand" href="/maurilio"><span className="brand-mark">M</span><span><b>MAURILIO</b><small>CONTROL ROOM</small></span></a>
        <span className="status-pill">PRE-LAUNCH</span>
      </header>
      <section className="control-hero">
        <div><span className="section-kicker">OPERATIONS</span><h1>Control Room</h1></div>
        <p>El panel desde el que se cargará, calculará, auditará y publicará cada Matchday. En esta fase guarda borradores sólo en este navegador.</p>
      </section>
      <ControlRoom />
    </main>
  );
}
