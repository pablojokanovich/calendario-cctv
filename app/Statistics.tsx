"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { dateIso, type EventRecord } from "../lib/agenda";
import { buildStatistics, type StatisticsRow } from "../lib/statistics";

function Ranking({ title, rows, color, operator = false }: { title: string; rows: StatisticsRow[]; color: string; operator?: boolean }) {
  const max = Math.max(1, ...rows.map(row => row.events));
  return <section className="statistics-ranking" aria-label={title}>
    <h3>{title}<span className="count">{rows.length}</span></h3>
    {rows.length ? <table><thead><tr><th scope="col">{operator ? "Operador" : title === "Por locación" ? "Locación" : "Servicio"}</th><th scope="col" title="Cada evento se cuenta una sola vez por fila, aunque tenga varias salas.">Eventos</th><th scope="col" title={operator ? "Fechas distintas con asignación en el período, incluyendo armado. Una fecha compartida por dos eventos cuenta una vez." : "Suma de días de cada evento dentro del período, incluyendo armado."}>{operator ? "Días asignados" : "Jornadas de evento"}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}><th scope="row"><span>{row.name}</span><span className="statistics-track" aria-hidden="true"><span style={{ width: `${row.events / max * 100}%`, background: color }} /></span></th><td>{row.events}</td><td>{row.days}</td></tr>)}</tbody></table>
      : <p className="statistics-empty">Sin datos en este período.</p>}
  </section>;
}

export function Statistics({ events, loading }: { events: EventRecord[]; loading: boolean }) {
  const [period, setPeriod] = useState("year");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const now = new Date();
  const year = now.getFullYear();
  const range = period === "year" ? { from: `${year}-01-01`, to: `${year}-12-31` }
    : period === "month" ? { from: dateIso(new Date(year, now.getMonth(), 1)), to: dateIso(new Date(year, now.getMonth() + 1, 0)) }
    : period === "custom" ? { from, to } : { from: "", to: "" };
  const data = useMemo(() => buildStatistics(events, { from: range.from, to: range.to }), [events, range.from, range.to]);
  return <section className="statistics" aria-label="Estadísticas de la agenda" aria-busy={loading}>
    <div className="statistics-controls"><label>Período<select aria-label="Período de estadísticas" value={period} onChange={event => setPeriod(event.target.value)}>
      <option value="year">Este año ({year})</option><option value="month">Este mes</option><option value="all">Todo el historial</option><option value="custom">Personalizado</option>
    </select></label>{period === "custom" && <><label>Desde<input type="date" aria-label="Estadísticas desde" value={from} onChange={event => setFrom(event.target.value)} /></label><label>Hasta<input type="date" aria-label="Estadísticas hasta" value={to} onChange={event => setTo(event.target.value)} /></label></>}</div>
    {data.invalidRange && <p className="error-message" role="alert">La fecha de inicio debe ser anterior o igual a la fecha de fin.</p>}
    {loading ? <p role="status" className="statistics-empty">Cargando estadísticas...</p> : <>
      <dl className="statistics-totals"><div><dt>Eventos</dt><dd>{data.eventCount}</dd></div><div><dt>Jornadas de evento</dt><dd>{data.eventDays}</dd></div><div><dt>Freelancers asignados</dt><dd>{data.operators.length}</dd></div><div><dt>Locaciones</dt><dd>{data.locations.length}</dd></div></dl>
      {!data.eventCount ? <div className="statistics-empty"><BarChart3 size={28} /><h3>No hay eventos en este período</h3></div> : <div className="statistics-rankings">
        <Ranking title="Por operador" rows={data.operators} color="#d71920" operator />
        <Ranking title="Por locación" rows={data.locations} color="#087eac" />
        <Ranking title="Por tipo de servicio" rows={data.services} color="#188153" />
      </div>}
    </>}
  </section>;
}
