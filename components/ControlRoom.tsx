"use client";

import { FormEvent, useMemo, useState } from "react";
import { currentMatchday } from "@/lib/demo-data";

type Draft = {
  event: string;
  market: string;
  price: string;
  minimum: string;
  model: string;
  range: string;
  stake: string;
  thesis: string;
  risk: string;
};

export default function ControlRoom() {
  const base = currentMatchday.picks[0];
  const [draft, setDraft] = useState<Draft>({
    event: base.event,
    market: base.market,
    price: base.price,
    minimum: base.minimum,
    model: String(base.model),
    range: base.range,
    stake: base.stake,
    thesis: base.thesis,
    risk: base.risk,
  });
  const [saved, setSaved] = useState(false);

  const metrics = useMemo(() => {
    const price = Number(draft.price) || 0;
    const model = Number(draft.model) || 0;
    const implied = price > 0 ? 100 / price : 0;
    const edge = model - implied;
    const ev = price > 0 ? (model / 100) * price * 100 - 100 : 0;
    return { implied, edge, ev };
  }, [draft.price, draft.model]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    localStorage.setItem("maurilio-control-room-draft", JSON.stringify(draft));
    setSaved(true);
  }

  return (
    <div className="control-grid">
      <form className="control-form" onSubmit={submit}>
        <div className="control-form-head"><span>01</span><div><small>FREE ANALYSIS</small><h2>Editor de Matchday</h2></div><b>LOCAL DRAFT</b></div>
        <label>Evento<input value={draft.event} onChange={(e) => update("event", e.target.value)} /></label>
        <label>Mercado<input value={draft.market} onChange={(e) => update("market", e.target.value)} /></label>
        <div className="control-pair">
          <label>Cuota Bet365<input inputMode="decimal" value={draft.price} onChange={(e) => update("price", e.target.value)} /></label>
          <label>Cuota mínima<input inputMode="decimal" value={draft.minimum} onChange={(e) => update("minimum", e.target.value)} /></label>
        </div>
        <div className="control-pair">
          <label>Probabilidad propia %<input inputMode="decimal" value={draft.model} onChange={(e) => update("model", e.target.value)} /></label>
          <label>Rango<input value={draft.range} onChange={(e) => update("range", e.target.value)} /></label>
        </div>
        <label>Stake<input value={draft.stake} onChange={(e) => update("stake", e.target.value)} /></label>
        <label>Tesis<textarea rows={3} value={draft.thesis} onChange={(e) => update("thesis", e.target.value)} /></label>
        <label>Mejor razón para NO apostar<textarea rows={3} value={draft.risk} onChange={(e) => update("risk", e.target.value)} /></label>
        <button className="primary-button control-save" type="submit">{saved ? "Borrador guardado" : "Guardar borrador local"}</button>
        <p className="control-footnote">Esta pantalla ya calcula precio y edge. La publicación real se habilitará cuando conectemos autenticación y base de datos.</p>
      </form>

      <aside className="control-preview">
        <span className="section-kicker">LIVE PREVIEW</span>
        <h3>{draft.event}</h3>
        <div className="preview-market"><small>MERCADO</small><b>{draft.market}</b><strong>@{draft.price}</strong></div>
        <div className="preview-metrics">
          <div><small>IMPLÍCITA</small><b>{metrics.implied.toFixed(1)}%</b></div>
          <div><small>MODELO</small><b>{Number(draft.model || 0).toFixed(1)}%</b></div>
          <div><small>EDGE</small><b className={metrics.edge > 0 ? "metric-positive" : ""}>{metrics.edge >= 0 ? "+" : ""}{metrics.edge.toFixed(1)}%</b></div>
          <div><small>EV</small><b className={metrics.ev > 0 ? "metric-positive" : ""}>{metrics.ev >= 0 ? "+" : ""}{metrics.ev.toFixed(1)}%</b></div>
        </div>
        <div className="preview-thesis"><small>TESIS</small><p>{draft.thesis}</p></div>
        <div className="preview-risk"><small>ADVERSARIAL CHECK</small><p>{draft.risk}</p></div>
      </aside>
    </div>
  );
}
