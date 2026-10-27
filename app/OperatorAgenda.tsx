"use client";
import { useMemo, useRef, useState } from "react";
import { Copy, Download, RotateCcw } from "lucide-react";
import { dateIso, type EventRecord } from "../lib/agenda";
import { agendaOperators, operatorAgenda, operatorAgendaText } from "../lib/operator-agenda";

export function OperatorAgenda({ events, catalogue }: { events: EventRecord[]; catalogue: string[] }) {
  const operators = useMemo(() => agendaOperators(events, catalogue), [events, catalogue]);
  const [name, setName] = useState("");
  const [from, setFrom] = useState(() => dateIso(new Date()));
  const [to, setTo] = useState("");
  const [edited, setEdited] = useState<{ source: string; text: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const preview = useRef<HTMLTextAreaElement>(null);
  const bookings = useMemo(() => operatorAgenda(events, name, from, to), [events, name, from, to]);
  const source = operatorAgendaText(name, bookings);
  const text = edited?.source === source ? edited.text : source;
  const invalid = !!(from && to && from > to);
  const dayCount = new Set(bookings.map(b => b.date)).size;
  const eventCount = new Set(bookings.map(b => b.eventId)).size;
  async function copy() {
    setError("");
    try { await navigator.clipboard.writeText(text); setCopied(text); }
    catch { preview.current?.focus(); preview.current?.select(); setError("No se pudo copiar. El texto quedó seleccionado."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `agenda-${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-")}.txt`;
    link.click(); URL.revokeObjectURL(url);
  }
  return <section className="operator-agenda" aria-label="Agenda individual para compartir">
    <div className="statistics-controls"><label>Operador<select aria-label="Operador de la agenda individual" value={name} onChange={event => setName(event.target.value)}><option value="">Seleccionar operador</option>{operators.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Desde<input type="date" aria-label="Agenda individual desde" value={from} onChange={event => setFrom(event.target.value)} /></label><label>Hasta<input type="date" aria-label="Agenda individual hasta" value={to} onChange={event => setTo(event.target.value)} /></label></div>
    {invalid && <p className="error-message" role="alert">La fecha de inicio debe ser anterior o igual a la fecha de fin.</p>}
    {!name ? <p className="statistics-empty">Sin operador seleccionado</p> : !bookings.length ? <p className="statistics-empty">Sin asignaciones en este período</p> : <div className="individual-layout">
      <section aria-label="Asignaciones individuales"><h3>{name} <span className="count">{dayCount} {dayCount === 1 ? "día" : "días"} · {eventCount} {eventCount === 1 ? "evento" : "eventos"}</span></h3>
        <ol className="individual-bookings">{bookings.map(booking => <li key={`${booking.eventId}-${booking.date}`}><time dateTime={booking.date}>{booking.date.split("-").reverse().join("/")}</time><span className="phase-badge">{booking.setup ? booking.eventDay ? "ARMADO + EVENTO" : "ARMADO" : "EVENTO"}</span><strong>{booking.eventName}</strong><span>#{booking.order} · {booking.location}</span>{booking.rooms.map((room, i) => <span key={i}>{room.name} · {room.roles.join(", ")}</span>)}</li>)}</ol>
      </section>
      <section className="individual-share" aria-label="Texto de la agenda individual"><div className="workspace-heading"><h3>Para compartir</h3><button type="button" className="icon-button" title="Restablecer texto" aria-label="Restablecer agenda individual" onClick={() => { setEdited(null); setCopied(""); }}><RotateCcw size={16} /></button></div>
        <textarea ref={preview} aria-label="Texto para compartir agenda individual" value={text} onChange={event => setEdited({ source, text: event.target.value })} rows={18} />
        <div className="individual-actions"><button type="button" className="primary" disabled={!text.trim()} onClick={() => void copy()}><Copy size={16} />{copied === text ? "Copiado" : "Copiar"}</button><button type="button" disabled={!text.trim()} onClick={download}><Download size={16} />Descargar texto</button></div>{error && <p role="alert">{error}</p>}
      </section></div>}
  </section>;
}
