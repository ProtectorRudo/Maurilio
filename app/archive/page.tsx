import type { Metadata } from "next";
import { archiveEntries } from "@/lib/demo-data";

export const metadata: Metadata = {
  title: "Archivo público — Maurilio",
  description: "Ledger auditable de selecciones, precio de entrada, CLV y resultado.",
};

export default function ArchivePage() {
  return (
    <main className="ledger-page">
      <header className="subpage-nav">
        <a className="brand" href="/"><span className="brand-mark">M</span><span><b>MAURILIO</b><small>QUANT FOOTBALL</small></span></a>
        <a href="/" className="text-button">Volver al Matchday</a>
      </header>
      <section className="ledger-hero">
        <span className="section-kicker">LEDGER PÚBLICO</span>
        <h1>El historial no se edita.<br/><em>Se audita.</em></h1>
        <p>Cuando Maurilio entre en producción, cada selección quedará fijada con hora, precio Bet365, cuota mínima, probabilidad propia y cierre.</p>
      </section>
      <section className="ledger-stats">
        <article><small>BANCA</small><strong>$100.000</strong><span>BASE DEMO</span></article>
        <article><small>P&L</small><strong>—</strong><span>SIN REGISTRO REAL AÚN</span></article>
        <article><small>ROI</small><strong>—</strong><span>SE CALCULA AUTOMÁTICO</span></article>
        <article><small>CLV MEDIO</small><strong>—</strong><span>PRECIO DE CIERRE BET365</span></article>
      </section>
      <section className="ledger-table-wrap">
        <div className="ledger-table-head">
          <div><span className="section-kicker">AUDIT TRAIL</span><h2>Selecciones registradas</h2></div>
          <span className="demo-badge">PRE-LAUNCH · SIN RESULTADOS REALES</span>
        </div>
        <div className="archive-table">
          <div className="archive-row archive-head"><span>ID</span><span>FECHA</span><span>EVENTO</span><span>MERCADO</span><span>CUOTA</span><span>EDGE</span><span>CLV</span><span>RESULTADO</span><span>P&L</span></div>
          {archiveEntries.map((entry) => (
            <div className="archive-row" key={entry.id}>
              <span>{entry.id}</span><span>{entry.date}</span><span>{entry.event}</span><span>{entry.market}</span><span>{entry.price}</span><span>{entry.edge}</span><span>{entry.clv}</span><b>{entry.result}</b><span>{entry.pnl}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="ledger-rule">
        <span>REGLA DE INTEGRIDAD</span>
        <p>Una predicción publicada nunca se reescribe retroactivamente. El resultado no convierte una mala decisión en buena, ni una pérdida convierte una decisión con valor en mala.</p>
      </section>
    </main>
  );
}
