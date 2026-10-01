export default function NoValueMatchday({
  label,
}: {
  label: string;
}) {
  return (
    <main className="site-shell no-value-page">
      <div className="noise" aria-hidden="true" />
      <header className="nav">
        <a className="brand" href="/maurilio">
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>QUANT FOOTBALL</small></span>
        </a>
        <nav className="nav-links" aria-label="Principal">
          <a href="/maurilio/archive">Registro</a>
        </nav>
      </header>

      <section className="no-value-hero">
        <span className="eyebrow"><span className="live-dot" /> {label}</span>
        <div className="no-value-terminal">
          <small>QUANT DECISION</small>
          <h1>HOY NO HAY APUESTA<br/>CON SUFICIENTE VALOR</h1>
          <p>
            El modelo no encontró una discrepancia que supere el precio mínimo,
            el rango de incertidumbre y la auditoría adversarial.
          </p>
          <div className="no-value-grid">
            <div><span>DECISIÓN</span><b>NO BET</b></div>
            <div><span>EXPOSICIÓN</span><b>0.00%</b></div>
            <div><span>DISCIPLINA</span><b>CAPITAL PRESERVADO</b></div>
          </div>
          <div className="risk-note">
            <span>REGLA MAURILIO</span>
            <p>
              No necesitamos apostar todos los días. Si el precio no compensa
              la incertidumbre, no compramos la probabilidad.
            </p>
          </div>
          <a className="text-button" href="/maurilio/archive">
            Ver ledger público
          </a>
        </div>
      </section>

      <footer>
        <span>© 2026 MAURILIO</span>
        <p>Información estadística. Ninguna apuesta es segura.</p>
      </footer>
    </main>
  );
}
