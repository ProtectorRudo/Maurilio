"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./studio.module.css";

type UnknownRow = Record<string, unknown>;

type EventCard = {
  id: string;
  title: string;
  competition: string;
  sport: string;
  start: string | null;
  raw: UnknownRow;
};

type LineCard = {
  selectionKey: string;
  market: string;
  selection: string;
  side: string;
  line: number | null;
  odds: number;
  raw: UnknownRow;
};

function deepValue(node: unknown, keys: string[], depth = 0): unknown {
  if (depth > 7 || node == null) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepValue(item, keys, depth + 1);
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return undefined;
  }
  if (typeof node !== "object") return undefined;
  const row = node as UnknownRow;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  for (const value of Object.values(row)) {
    if (value && typeof value === "object") {
      const found = deepValue(value, keys, depth + 1);
      if (found !== undefined && found !== null && found !== "") return found;
    }
  }
  return undefined;
}

function stringValue(node: unknown, keys: string[], fallback = "") {
  const value = deepValue(node, keys);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function eventId(row: UnknownRow) {
  for (const key of ["id", "event_id", "eventId", "key"]) {
    const value = row[key];
    if (typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(value)) {
      return value;
    }
  }
  const nested = deepValue(row, ["event_id", "eventId"]);
  return typeof nested === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(nested)
    ? nested
    : "";
}

function eventStart(row: UnknownRow) {
  const value = deepValue(row, ["start_time", "startTime", "start_at", "event_start_at", "date"]);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const date = new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
  }
  return null;
}

function normalizeEvents(items: unknown[]): EventCard[] {
  const rows: EventCard[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as UnknownRow;
    const id = eventId(raw);
    if (!id) continue;
    const home = stringValue(raw, ["home_team", "homeTeam", "home"], "Local");
    const away = stringValue(raw, ["away_team", "awayTeam", "away"], "Visitante");
    rows.push({
      id,
      title: `${home} vs ${away}`,
      competition: stringValue(raw, ["league", "competition", "league_name"], "Competencia"),
      sport: stringValue(raw, ["sport", "sport_name"], "Deporte"),
      start: eventStart(raw),
      raw,
    });
  }
  return rows;
}

function settleable(row: UnknownRow) {
  const betType = String(row.bet_type ?? "").trim().toLowerCase();
  const marketKey = String(row.market_key ?? "").trim().toLowerCase();
  const periodRaw = row.period_str ?? row.period;
  const period = periodRaw == null ? "" : String(periodRaw).trim().toLowerCase();

  if (
    period &&
    !period.includes("full") &&
    !period.includes("match") &&
    !period.includes("game")
  ) {
    return false;
  }

  const family =
    betType === "moneyline" || marketKey === "moneyline" || marketKey === "moneyline 3w"
      ? "moneyline"
      : betType === "handicap" || marketKey === "handicap" || marketKey === "spread"
        ? "handicap"
        : betType === "total" || marketKey === "total" || marketKey === "over_under"
          ? "total"
          : null;

  if (!family) return false;

  const side = String(row.side ?? "").trim().toLowerCase();
  if (family === "moneyline") return ["home", "away", "draw"].includes(side);

  const threshold = Number(row.line);
  if (!Number.isFinite(threshold)) return false;
  if (family === "handicap") return ["home", "away"].includes(side);
  return ["over", "under"].includes(side);
}

function flattenLines(node: unknown, depth = 0, found = new Map<string, LineCard>()) {
  if (depth > 10 || node == null) return found;

  if (Array.isArray(node)) {
    for (const item of node) flattenLines(item, depth + 1, found);
    return found;
  }

  if (typeof node !== "object") return found;
  const row = node as UnknownRow;
  const key = typeof row.selection_key === "string" ? row.selection_key.trim() : "";
  const odds = Number(row.odds ?? row.price);

  if (key && Number.isFinite(odds) && odds > 1 && settleable(row)) {
    const lineNumber = Number(row.line);
    found.set(key, {
      selectionKey: key,
      market: String(row.market_key ?? row.bet_type ?? row.market ?? "Mercado"),
      selection: String(row.selection_name ?? row.selection ?? row.side ?? row.name ?? key),
      side: String(row.side ?? ""),
      line: Number.isFinite(lineNumber) ? lineNumber : null,
      odds,
      raw: row,
    });
  }

  for (const value of Object.values(row)) {
    if (value && typeof value === "object") flattenLines(value, depth + 1, found);
  }

  return found;
}

function dateTime(value: string | null) {
  if (!value) return "Horario no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Horario no disponible";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function TipsterStudio() {
  const [accountReady, setAccountReady] = useState(false);
  const [tipsterReady, setTipsterReady] = useState(false);
  const [feedReady, setFeedReady] = useState<boolean | null>(null);
  const [events, setEvents] = useState<EventCard[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<EventCard | null>(null);
  const [lines, setLines] = useState<LineCard[]>([]);
  const [selectedLine, setSelectedLine] = useState<LineCard | null>(null);
  const [stake, setStake] = useState("1");
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function loadEvents() {
    setLoadingEvents(true);
    setMessage(null);
    try {
      const response = await fetch("/maurilio/api/bet365?view=events&limit=100", {
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.assign("/maurilio/ingresar?next=%2Festudio");
        return;
      }

      const body = await response.json() as {
        error?: string;
        items?: unknown[];
      };

      if (!response.ok) {
        setFeedReady(false);
        setMessage({ kind: "error", text: "El feed Bet365 no está disponible." });
        return;
      }

      setFeedReady(true);
      setEvents(normalizeEvents(Array.isArray(body.items) ? body.items : []));
    } catch {
      setFeedReady(false);
      setMessage({ kind: "error", text: "No pudimos cargar los eventos Bet365." });
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const accountResponse = await fetch("/maurilio/api/account", { cache: "no-store" });

        if (accountResponse.status === 401) {
          window.location.assign("/maurilio/ingresar?next=%2Festudio");
          return;
        }

        const account = await accountResponse.json() as {
          role?: string;
          tipster?: unknown;
        };

        const ready =
          (account.role === "tipster" || account.role === "admin") &&
          Boolean(account.tipster);

        setTipsterReady(ready);
        setAccountReady(true);

        if (ready) {
          const statusResponse = await fetch("/maurilio/api/bet365?view=status", {
            cache: "no-store",
          });
          const status = await statusResponse.json() as {
            configured?: boolean;
            bookmakerAvailable?: boolean;
          };
          const okay = Boolean(
            statusResponse.ok &&
            status.configured &&
            status.bookmakerAvailable !== false,
          );
          setFeedReady(okay);

          if (okay) await loadEvents();
        }
      } catch {
        setAccountReady(true);
        setTipsterReady(false);
      }
    })();
  }, []);

  async function chooseEvent(event: EventCard) {
    setSelectedEvent(event);
    setSelectedLine(null);
    setLines([]);
    setMessage(null);
    setLoadingLines(true);

    try {
      const response = await fetch(
        `/maurilio/api/bet365?view=odds&event_id=${encodeURIComponent(event.id)}`,
        { cache: "no-store" },
      );
      const body = await response.json() as {
        error?: string;
        snapshot?: unknown;
      };

      if (!response.ok) {
        setMessage({ kind: "error", text: "No pudimos obtener las cuotas Bet365 de ese evento." });
        return;
      }

      const found = [...flattenLines(body.snapshot).values()]
        .sort((a, b) => a.market.localeCompare(b.market) || a.odds - b.odds);
      setLines(found);

      if (found.length === 0) {
        setMessage({
          kind: "error",
          text: "No hay mercados compatibles con liquidación automática en este evento.",
        });
      }
    } catch {
      setMessage({ kind: "error", text: "No pudimos cargar las cuotas del evento." });
    } finally {
      setLoadingLines(false);
    }
  }

  const visibleEvents = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) =>
      [event.title, event.competition, event.sport].join(" ").toLowerCase().includes(query),
    );
  }, [events, filter]);

  async function publish() {
    if (!selectedEvent || !selectedLine) return;

    const stakeUnits = Number(stake);
    if (!Number.isFinite(stakeUnits) || stakeUnits <= 0 || stakeUnits > 5) {
      setMessage({ kind: "error", text: "El stake debe ser mayor a 0 y no superar 5 unidades." });
      return;
    }

    const confirmed = window.confirm(
      `Publicar ${selectedLine.selection} a la cuota Bet365 que el servidor valide ahora. Después no se puede editar. ¿Continuar?`,
    );
    if (!confirmed) return;

    setPublishing(true);
    setMessage(null);

    try {
      const response = await fetch("/maurilio/api/tipster/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          selectionKey: selectedLine.selectionKey,
          stakeUnits,
        }),
      });
      const body = await response.json() as {
        error?: string;
        tip?: {
          publicId?: string;
          entryOdds?: number | string;
        };
      };

      if (!response.ok) {
        const copy =
          body.error === "duplicate_tip"
            ? "Ya publicaste esta misma selección para este evento. No se permiten duplicados."
            : body.error === "market_not_auto_settleable"
              ? "Ese mercado no permite liquidación automática."
              : body.error === "bet365_selection_unavailable"
                ? "La línea ya no está disponible en Bet365. Recargá las cuotas."
                : body.error === "event_started"
                  ? "El evento ya comenzó."
                  : "No pudimos publicar el tip.";
        setMessage({ kind: "error", text: copy });
        return;
      }

      const confirmedOdds = Number(body.tip?.entryOdds);
      setMessage({
        kind: "success",
        text:
          `Tip ${body.tip?.publicId ?? ""} publicado y sellado` +
          (Number.isFinite(confirmedOdds) ? ` a cuota Bet365 ${confirmedOdds.toFixed(2)}.` : "."),
      });
      setSelectedLine(null);
      await chooseEvent(selectedEvent);
    } catch {
      setMessage({ kind: "error", text: "No pudimos publicar el tip." });
    } finally {
      setPublishing(false);
    }
  }

  if (!accountReady) {
    return <div className={styles.empty}><b>Cargando estudio…</b></div>;
  }

  if (!tipsterReady) {
    return (
      <div className={styles.empty}>
        <b>Primero necesitás crear tu perfil de tipster.</b>
        <Link href="/para-tipsters">Ir a configurar perfil</Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.simpleTop}>
        <div>
          <span className={`${styles.status} ${feedReady === false ? styles.offline : ""}`}>
            {feedReady === null ? "Conectando" : feedReady ? "Bet365 conectado" : "Bet365 no disponible"}
          </span>
          <h1>Publicar tip</h1>
          <p>Elegí partido, apuesta y stake.</p>
        </div>
      </div>

      <div className={styles.stepBar}>
        <span className={selectedEvent ? styles.doneStep : styles.activeStep}>1. Partido</span>
        <span className={selectedLine ? styles.doneStep : selectedEvent ? styles.activeStep : ""}>2. Apuesta</span>
        <span className={selectedLine ? styles.activeStep : ""}>3. Publicar</span>
      </div>

      <div className={styles.simpleControls}>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Buscar equipo o liga"
        />
        <button type="button" onClick={() => void loadEvents()} disabled={loadingEvents}>
          {loadingEvents ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <b>Partidos</b>
            <span>{visibleEvents.length}</span>
          </div>

          <div className={styles.events}>
            {visibleEvents.length === 0 ? (
              <div className={styles.empty}>
                <b>No hay partidos.</b>
                Probá actualizar.
              </div>
            ) : (
              visibleEvents.map((event) => (
                <button
                  type="button"
                  key={event.id}
                  className={`${styles.event} ${selectedEvent?.id === event.id ? styles.selected : ""}`}
                  onClick={() => void chooseEvent(event)}
                >
                  <strong>{event.title}</strong>
                  <span>{event.competition}</span>
                  <small>{dateTime(event.start)}</small>
                </button>
              ))
            )}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.oddsPanel}`}>
          <div className={styles.panelHead}>
            <b>{selectedEvent ? "Elegí una apuesta" : "Apuestas"}</b>
            {selectedEvent ? <span>{selectedEvent.title}</span> : null}
          </div>

          {loadingLines ? (
            <div className={styles.empty}><b>Cargando apuestas…</b></div>
          ) : !selectedEvent ? (
            <div className={styles.empty}>
              <b>Primero elegí un partido.</b>
            </div>
          ) : lines.length === 0 ? (
            <div className={styles.empty}><b>No hay apuestas disponibles.</b></div>
          ) : (
            <div className={styles.simpleLines}>
              {lines.map((line) => (
                <button
                  type="button"
                  className={`${styles.simpleLine} ${selectedLine?.selectionKey === line.selectionKey ? styles.chosenLine : ""}`}
                  key={line.selectionKey}
                  onClick={() => setSelectedLine(line)}
                >
                  <span>
                    <strong>{line.selection}</strong>
                    <small>{line.market}{line.line !== null ? ` · ${line.line}` : ""}</small>
                  </span>
                  <b>{line.odds.toFixed(2)}</b>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedLine && selectedEvent ? (
        <section className={styles.simplePublish}>
          <div className={styles.chosenBet}>
            <span>{selectedEvent.title}</span>
            <strong>{selectedLine.selection}</strong>
            <b>{selectedLine.odds.toFixed(2)}</b>
          </div>

          <label>
            Stake
            <input
              type="number"
              min="0.01"
              max="5"
              step="0.01"
              value={stake}
              onChange={(event) => setStake(event.target.value)}
            />
          </label>

          <button
            className={styles.button}
            disabled={publishing}
            type="button"
            onClick={() => void publish()}
          >
            {publishing ? "Publicando…" : "Publicar tip"}
          </button>

          <small>Al publicar, Maurilio vuelve a validar la cuota Bet365.</small>
        </section>
      ) : null}

      {message ? (
        <div className={`${styles.message} ${message.kind === "success" ? styles.success : styles.error}`}>
          {message.text}
        </div>
      ) : null}
    </>
  );
}
