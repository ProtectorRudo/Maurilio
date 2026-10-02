export default function WaitingMatchday() {
  return (
    <main className="site-shell no-value-page">
      <div className="noise" aria-hidden="true" />
      <header className="nav">
        <a className="brand" href="/maurilio">
          <span className="brand-mark">M</span>
          <span><b>MAURILIO</b><small>QUANT FOOTBALL</small></span>
        </a>
        <nav className="nav-links" aria-label="Principal">
          <a href="/maurilio/integrity">Integridad</a>
          <a href="/maurilio/archive">Registro</a>
        </nav>
      </header>

      <section className="no-value-hero">
        <div className="no-value-terminal">
          <small>QUANT DESK</small>
          <h1>PRÓXIMO MATCHDAY<br/>EN PREPARACIÓN</h1>
          <p>
            No hay una jornada publicada en este momento. Ningún pick demo se
            muestra como si fuera una señal real.
          </p>
          <div className="no-value-grid">
            <div><span>ESTADO</span><b>OFF MARKET</b></div>
            <div><span>SEÑALES</span><b>0 PUBLICADAS</b></div>
            <div><span>PROTECCIÓN</span><b>FAIL CLOSED</b></div>
          </div>
          <a className="text-button" href="/maurilio/archive">
            Abrir ledger público
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
