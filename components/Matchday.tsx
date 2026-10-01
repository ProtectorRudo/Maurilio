"use client";

import { useEffect, useMemo, useState } from "react";

type Phase = "idle" | "checking" | "revealed";
type LockedTier = "pro" | "elite" | null;

const demoPick = {
  competition: "MAURILIO LAB · DEMO",
  event: "Atlético Norte vs Unión Central",
  market: "Más de 4.5 tarjetas",
  price: "1.83",
  minimum: "1.72",
  implied: "54.6%",
  model: "63.0%",
  range: "58–67%",
  edge: "+8.4%",
  ev: "+15.3%",
  stake: "0.75%",
};

const auditSteps = [
  "Contexto competitivo",
  "Disponibilidad & alineaciones",
  "Métricas del mercado",
  "Precio Bet365",
  "Modelo probabilístico",
  "Auditoría adversarial",
];

function Icon({ name }: { name: "shield" | "chart" | "lock" | "arrow" | "check" | "ball" }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "shield") return <svg {...common}><path d="M12 3l7 3v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 2 5-6"/></svg>;
  if (name === "lock") return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14"/><path d="M14 7l5 5-5 5"/></svg>;
  if (name === "check") return <svg {...common}><path d="M5 12l4 4L19 6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8.5 5.2l3.5 2.5 3.5-2.5"/><path d="M7 14l2-4.2h6L17 14l-5 3.7z"/><path d="M4 10l5 .2"/><path d="M20 10l-5 .2"/></svg>;
}

export default function Matchday() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lockedTier, setLockedTier] = useState<LockedTier>(null);
  const [activeAudit, setActiveAudit] = useState(0);

  useEffect(() => {
    if (phase !== "checking") return;
    setActiveAudit(0);
    const interval = window.setInterval(() => {
      setActiveAudit((value) => Math.min(value + 1, auditSteps.length - 1));
    }, 230);
    const timer = window.setTimeout(() => {
      window.clearInterval(interval);
      setPhase("revealed");
    }, 1650);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [phase]);

  const dateLabel = useMemo(() => "01 OCT · MATCHDAY 001", []);

  return (
    <main className="site-shell">
      <div className="noise" aria-hidden="true" />
      <header className="nav">
        <a className="brand" href="#top" aria-label="Maurilio Bet">
          <span className="brand-mark">M</span>
          <span>
            <b>MAURILIO</b>
            <small>QUANT FOOTBALL</small>
          </span>
        </a>
        <nav className="nav-links" aria-label="Principal">
          <a href="#matchday">Matchday</a>
          <a href="#method">Método</a>
          <a href="#transparency">Registro</a>
        </nav>
        <a className="nav-cta" href="#matchday">Entrar al vestuario <Icon name="arrow" /></a>
      </header>

      <section className="hero" id="top">
        <div className="stadium-lights" aria-hidden="true">
          <i/><i/><i/><i/><i/><i/>
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot"/> {dateLabel}</div>
            <h1>El mercado pone<br/>el precio.<br/><em>Nosotros auditamos<br/>la probabilidad.</em></h1>
            <p className="hero-lead">
              Investigación cuantitativa de fútbol con disciplina de trading:
              modelo propio, precio mínimo, rango de incertidumbre y auditoría adversarial.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#matchday">Ver análisis de hoy <Icon name="arrow" /></a>
              <a className="text-button" href="#method">Cómo funciona</a>
            </div>
          </div>

          <aside className="terminal-card">
            <div className="terminal-top">
              <span>MAURILIO / QUANT DESK</span>
              <span className="status-pill">ONLINE</span>
            </div>
            <div className="terminal-radar">
              <div className="radar-circle r1"/><div className="radar-circle r2"/>
              <div className="radar-line vertical"/><div className="radar-line horizontal"/>
              <div className="radar-sweep"/>
              <span className="radar-point p1"/><span className="radar-point p2"/><span className="radar-point p3"/>
              <div className="radar-center">M</div>
            </div>
            <div className="terminal-data">
              <div><small>ENFOQUE</small><b>EV POSITIVO</b></div>
              <div><small>PRECIO</small><b>BET365</b></div>
              <div><small>RIESGO</small><b>0.5–2%</b></div>
            </div>
            <div className="terminal-ticker"><span>SCANNING LIQUID MARKETS</span><span>MODEL CALIBRATED</span><span>NO CHASING</span></div>
          </aside>
        </div>

        <div className="principles-row">
          <span><Icon name="shield"/> Sin promesas de certeza</span>
          <span><Icon name="chart"/> Precio vs probabilidad</span>
          <span><Icon name="check"/> Historial auditable</span>
        </div>
      </section>

      <section className="matchday-section" id="matchday">
        <div className="section-heading">
          <div>
            <span className="section-kicker">EL VESTUARIO</span>
            <h2>Elegí tu nivel de lectura.</h2>
          </div>
          <p>Un análisis abierto. Dos informes premium. La intensidad del stake nunca reemplaza la gestión de riesgo.</p>
        </div>

        <div className="tiers-grid">
          <article className="tier-card free-card">
            <div className="tier-glow"/>
            <div className="tier-header">
              <span className="tier-number">01</span>
              <span className="unlocked"><Icon name="check"/> ABIERTO</span>
            </div>
            <div className="jersey jersey-free" aria-hidden="true">
              <span className="jersey-neck"/>
              <span className="jersey-brand">M</span>
              <b>FREE</b>
              <small>0.75%</small>
            </div>
            <div className="tier-copy">
              <span className="tier-label">OPEN ANALYSIS</span>
              <h3>Primera lectura</h3>
              <p>Una oportunidad abierta para entender cómo pensamos antes de comprar nada.</p>
            </div>
            <button className="tier-action" onClick={() => document.getElementById("reveal")?.scrollIntoView({behavior:"smooth"})}>
              Revelar análisis <Icon name="arrow"/>
            </button>
          </article>

          <article className="tier-card pro-card">
            <div className="tier-header">
              <span className="tier-number">02</span>
              <span className="locked"><Icon name="lock"/> SELLADO</span>
            </div>
            <div className="jersey jersey-pro" aria-hidden="true">
              <span className="jersey-neck"/>
              <span className="jersey-brand">M</span>
              <b>PRO</b>
              <small>1.25%</small>
            </div>
            <div className="tier-copy">
              <span className="tier-label">VAR AUDIT</span>
              <h3>Convicción media</h3>
              <p>Más señales alineadas, auditoría ampliada y precio mínimo explícito.</p>
            </div>
            <button className="tier-action ghost" onClick={() => setLockedTier("pro")}>
              Desbloquear PRO <Icon name="lock"/>
            </button>
          </article>

          <article className="tier-card elite-card">
            <div className="elite-badge">HIGH CONVICTION</div>
            <div className="tier-header">
              <span className="tier-number">03</span>
              <span className="locked fire"><Icon name="lock"/> PRIVATE</span>
            </div>
            <div className="jersey jersey-elite" aria-hidden="true">
              <span className="jersey-neck"/>
              <span className="jersey-brand">M</span>
              <b>ELITE</b>
              <small>1.75%</small>
            </div>
            <div className="tier-copy">
              <span className="tier-label">THE LOCKER</span>
              <h3>Máxima convicción</h3>
              <p>Reservado para discrepancias excepcionales. Si no existe valor real, no aparece.</p>
            </div>
            <button className="tier-action elite-action" onClick={() => setLockedTier("elite")}>
              Entrar a The Locker <Icon name="arrow"/>
            </button>
          </article>
        </div>
      </section>

      <section className="reveal-section" id="reveal">
        <div className="reveal-stage">
          <div className="pitch-lines" aria-hidden="true"><span/><i/><b/></div>
          <div className="scoreboard">
            <div className="scoreboard-top"><span>MAURILIO MATCHDAY</span><span>FREE ACCESS</span></div>

            {phase === "idle" && (
              <div className="penalty-state">
                <div className="goal">
                  <span className="goal-net"/>
                  <div className="keeper">M</div>
                </div>
                <button className="ball-button" onClick={() => setPhase("checking")} aria-label="Ejecutar penal y revelar análisis">
                  <span className="ball"><Icon name="ball"/></span>
                  <b>TOCÁ PARA EJECUTAR</b>
                  <small>El reveal comienza con una auditoría automática</small>
                </button>
              </div>
            )}

            {phase === "checking" && (
              <div className="checking-state">
                <span className="var-title">QUANT REVIEW</span>
                <h3>Auditando la oportunidad…</h3>
                <div className="audit-list">
                  {auditSteps.map((step, index) => (
                    <div className={index <= activeAudit ? "audit-row active" : "audit-row"} key={step}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <b>{step}</b>
                      <i>{index < activeAudit ? "CHECK" : index === activeAudit ? "READING" : "WAIT"}</i>
                    </div>
                  ))}
                </div>
                <div className="scan-line"/>
              </div>
            )}

            {phase === "revealed" && (
              <div className="revealed-state">
                <div className="decision-line"><span>QUANT DECISION</span><b>VALUE DETECTED</b></div>
                <span className="demo-badge">DATOS DEMO · LISTO PARA CONECTAR AL PANEL REAL</span>
                <small className="competition">{demoPick.competition}</small>
                <h3>{demoPick.event}</h3>
                <div className="pick-main">
                  <div>
                    <small>MERCADO</small>
                    <strong>{demoPick.market}</strong>
                  </div>
                  <div className="price-box">
                    <small>BET365</small>
                    <strong>@{demoPick.price}</strong>
                  </div>
                </div>
                <div className="metrics-grid">
                  <div><small>CUOTA MÍN.</small><b>{demoPick.minimum}</b></div>
                  <div><small>IMPLÍCITA</small><b>{demoPick.implied}</b></div>
                  <div className="accent-metric"><small>NUESTRO MODELO</small><b>{demoPick.model}</b><em>{demoPick.range}</em></div>
                  <div><small>EDGE</small><b>{demoPick.edge}</b></div>
                  <div><small>EV</small><b>{demoPick.ev}</b></div>
                  <div><small>STAKE</small><b>{demoPick.stake}</b></div>
                </div>
                <div className="value-bars">
                  <div><span>Mercado</span><i><b style={{width:"54.6%"}}/></i><strong>54.6%</strong></div>
                  <div><span>Maurilio</span><i><b style={{width:"63%"}}/></i><strong>63.0%</strong></div>
                </div>
                <button className="reset-button" onClick={() => setPhase("idle")}>Repetir experiencia</button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="method-section" id="method">
        <div className="section-heading compact">
          <div>
            <span className="section-kicker">MÉTODO MAURILIO</span>
            <h2>No pronosticamos.<br/>Compramos probabilidades.</h2>
          </div>
          <p>Una selección sólo existe si sobrevive al modelo y al intento deliberado de demostrar que está mal.</p>
        </div>
        <div className="method-grid">
          {[
            ["01","MAPEAR","Mercados líquidos, contexto y disponibilidad."],
            ["02","MODELAR","Históricos ajustados, matchup, forma y señales propias."],
            ["03","PRECIFICAR","Probabilidad propia, cuota justa, edge y EV."],
            ["04","ATACAR","Buscamos la mejor razón para NO tomar la apuesta."],
            ["05","LIMITAR","Cuota mínima, stake acotado y exposición máxima."],
            ["06","AUDITAR","Cierre, CLV, resultado y aprendizaje sin reescribir el pasado."],
          ].map(([n,t,d]) => <article className="method-card" key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}
        </div>
      </section>

      <section className="transparency-section" id="transparency">
        <div className="transparency-panel">
          <div>
            <span className="section-kicker">LEDGER PÚBLICO</span>
            <h2>La confianza no se promete.<br/>Se deja auditar.</h2>
            <p>Ganadas y perdidas. Precio de entrada, cierre, CLV y aprendizaje. Sin borrar pronósticos incómodos.</p>
          </div>
          <div className="ledger-preview">
            <div className="ledger-head"><span>ID</span><span>EDGE</span><span>CLV</span><span>STATUS</span></div>
            <div><span>#M001</span><span>+8.4%</span><span>—</span><b>DEMO</b></div>
            <div><span>#M002</span><span>—</span><span>—</span><em>LOCKED</em></div>
            <div><span>#M003</span><span>—</span><span>—</span><em>LOCKED</em></div>
          </div>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">M</span><span><b>MAURILIO</b><small>QUANT FOOTBALL</small></span></a>
        <p>Información y análisis estadístico. Ninguna apuesta es segura. Gestión de riesgo obligatoria.</p>
        <span>© 2026 MAURILIO</span>
      </footer>

      {lockedTier && (
        <div className="modal-backdrop" onMouseDown={() => setLockedTier(null)}>
          <div className="access-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setLockedTier(null)}>×</button>
            <span className="modal-icon"><Icon name="lock"/></span>
            <small>{lockedTier === "elite" ? "THE LOCKER" : "VAR AUDIT"}</small>
            <h3>{lockedTier === "elite" ? "Acceso High Conviction" : "Acceso PRO"}</h3>
            <p>La experiencia de pago ya tiene su entrada diseñada. El siguiente paso es conectar checkout, usuario y desbloqueo persistente.</p>
            <button className="primary-button modal-button" onClick={() => setLockedTier(null)}>Entendido</button>
          </div>
        </div>
      )}
    </main>
  );
}
