"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => Promise<object>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

type Assignment = {
  salon: string;
  serviceType: string;
  director: string;
  cameras: string;
  wp: boolean;
  volante: string;
  vmix: string;
  vmixType: string;
  status: string;
};

type EventRecord = {
  id: number;
  orderNumber: string;
  eventName: string;
  location: string;
  setupDate: string;
  startDate: string;
  endDate: string;
  phase: "ARMADO" | "EVENTO" | "ARMADO + EVENTO";
  color: string;
  assignments: Assignment[];
};

type EventDraft = Omit<EventRecord, "id">;

const colors = ["#ff2a1f", "#ffed00", "#00e51f", "#9a00ff", "#69a0e8", "#f5c8c9", "#f300dc", "#6547a5", "#ffe79a", "#ff9700"];
const operatorOptions = ["", "Lean", "Pablo", "Giuli", "Rodri", "Cami", "Lucas", "Esteban", "Maca", "Paola", "Jero", "Carla"];

const emptyAssignment: Assignment = {
  salon: "",
  serviceType: "CCTV A 2",
  director: "",
  cameras: "",
  wp: false,
  volante: "",
  vmix: "",
  vmixType: "",
  status: "Pendiente",
};

const initialDraft: EventDraft = {
  orderNumber: "",
  eventName: "",
  location: "",
  setupDate: "",
  startDate: "",
  endDate: "",
  phase: "EVENTO",
  color: colors[0],
  assignments: [{ ...emptyAssignment }],
};

const sampleEvents: EventRecord[] = [
  {
    id: -1,
    orderNumber: "0519",
    eventName: "FACOEXTERNA",
    location: "CEC",
    setupDate: "2026-08-18",
    startDate: "2026-08-20",
    endDate: "2026-08-22",
    phase: "ARMADO + EVENTO",
    color: "#ff2a1f",
    assignments: [
      { salon: "C3", serviceType: "VMIX + 1 PTZ", director: "", cameras: "Adro", wp: true, volante: "", vmix: "1", vmixType: "", status: "Confirmado" },
      { salon: "BUSES", serviceType: "VMIX + 1 PTZ", director: "", cameras: "Lucas", wp: true, volante: "", vmix: "1", vmixType: "", status: "Confirmado" },
      { salon: "SALA D", serviceType: "VMIX + 1 PTZ", director: "", cameras: "Jero", wp: true, volante: "", vmix: "1", vmixType: "", status: "Confirmado" },
    ],
  },
  {
    id: -2,
    orderNumber: "0219",
    eventName: "HOTELGA",
    location: "RURAL",
    setupDate: "2026-09-01",
    startDate: "2026-09-02",
    endDate: "2026-09-04",
    phase: "ARMADO + EVENTO",
    color: "#69a0e8",
    assignments: [
      { salon: "VERDE", serviceType: "CCTV A 2 HD", director: "1 (FIORE)", cameras: "2 (FIORE, GUIDO O NOELIA)", wp: false, volante: "", vmix: "", vmixType: "", status: "A confirmar" },
      { salon: "AMARILLO", serviceType: "CCTV A 1 HD", director: "", cameras: "1 (ESTEBAN GOMEZ)", wp: false, volante: "", vmix: "", vmixType: "", status: "A confirmar" },
    ],
  },
  {
    id: -3,
    orderNumber: "1154",
    eventName: "LIBERTAD",
    location: "SHERATON",
    setupDate: "2026-08-31",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    phase: "ARMADO + EVENTO",
    color: "#9a00ff",
    assignments: [{ salon: "LIBERTADOR ABC", serviceType: "CCTV A 2", director: "Maca", cameras: "Lucas, Esteban", wp: false, volante: "", vmix: "", vmixType: "", status: "Pendiente" }],
  },
];

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" }).toUpperCase();
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatShort(value: string) {
  if (!value) return "";
  return parseDate(value).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "numeric" });
}

function daysBetween(start: string, end: string) {
  if (!start || !end) return [];
  const days: string[] = [];
  const cursor = parseDate(start);
  const last = parseDate(end);
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function isDark(hex: string) {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 145;
}

function textFor(event: EventRecord, day: string) {
  const setup = event.setupDate === day;
  const eventDay = day >= event.startDate && day <= event.endDate;
  const phase = setup && eventDay ? "ARMADO / EVENTO" : setup ? "ARMADO" : eventDay ? "EVENTO" : event.phase;
  const salones = event.assignments.map((item) => item.salon).filter(Boolean).join(", ");
  const services = Array.from(new Set(event.assignments.map((item) => item.serviceType).filter(Boolean))).join(" + ");
  return `${event.orderNumber}-${event.eventName}-${event.location}${salones ? `-${salones}` : ""}\n${services}\n${phase}`;
}

function csvEscape(value: string | number | boolean) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizeToolEvent(input: unknown): EventDraft {
  if (!input || typeof input !== "object") {
    throw new Error("Datos de evento invalidos.");
  }

  const value = input as Partial<EventDraft>;
  if (!value.orderNumber || !value.eventName || !value.location || !value.startDate || !value.endDate) {
    throw new Error("Faltan nro de orden, evento, lugar, inicio o fin.");
  }

  return {
    orderNumber: String(value.orderNumber),
    eventName: String(value.eventName).toUpperCase(),
    location: String(value.location).toUpperCase(),
    setupDate: value.setupDate ? String(value.setupDate) : String(value.startDate),
    startDate: String(value.startDate),
    endDate: String(value.endDate),
    phase: value.phase ?? "EVENTO",
    color: value.color ?? colors[0],
    assignments: Array.isArray(value.assignments) && value.assignments.length ? value.assignments : [{ ...emptyAssignment }],
  };
}

export default function AgendaApp() {
  const [events, setEvents] = useState<EventRecord[]>(sampleEvents);
  const [draft, setDraft] = useState<EventDraft>({ ...initialDraft, setupDate: isoToday(), startDate: isoToday(), endDate: isoToday() });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => new Date(2026, 8, 1));
  const [view, setView] = useState<"calendar" | "sheet">("calendar");
  const [message, setMessage] = useState("Cargando agenda compartida...");

  useEffect(() => {
    fetch("/api/events")
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data.events)) {
          setEvents(data.events.length ? data.events : sampleEvents);
          setMessage(data.events.length ? "Agenda sincronizada" : "Usando datos de ejemplo");
        }
      })
      .catch(() => setMessage("Modo vista previa local"));
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "create_cctv_event",
          title: "Crear evento CCTV",
          description: "Crea un evento en la agenda CCTV con fechas, color y asignaciones de salones u operadores.",
          inputSchema: {
            type: "object",
            properties: {
              orderNumber: { type: "string" },
              eventName: { type: "string" },
              location: { type: "string" },
              setupDate: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              phase: { type: "string", enum: ["ARMADO", "EVENTO", "ARMADO + EVENTO"] },
              color: { type: "string" },
              assignments: { type: "array" },
            },
            required: ["orderNumber", "eventName", "location", "startDate", "endDate"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const payload = normalizeToolEvent(input);
            const response = await fetch("/api/events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              throw new Error("No se pudo crear el evento.");
            }
            const data = (await response.json()) as { event: EventRecord };
            setEvents((current) => [...current, data.event]);
            setMessage("Evento creado");
            return { id: data.event.id, orderNumber: data.event.orderNumber, eventName: data.event.eventName };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  const monthDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);
    const leading = (first.getDay() + 6) % 7;
    const days: Array<{ date: Date; inMonth: boolean; iso: string }> = [];
    for (let i = leading; i > 0; i -= 1) {
      const date = new Date(year, monthIndex, 1 - i);
      days.push({ date, inMonth: false, iso: date.toISOString().slice(0, 10) });
    }
    for (let day = 1; day <= last.getDate(); day += 1) {
      const date = new Date(year, monthIndex, day);
      days.push({ date, inMonth: true, iso: date.toISOString().slice(0, 10) });
    }
    while (days.length % 7 !== 0) {
      const date = new Date(year, monthIndex, last.getDate() + days.length - leading - last.getDate() + 1);
      days.push({ date, inMonth: false, iso: date.toISOString().slice(0, 10) });
    }
    return days;
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRecord[]>();
    events.forEach((event) => {
      const activeDays = new Set([...daysBetween(event.startDate, event.endDate), event.setupDate].filter(Boolean));
      activeDays.forEach((day) => map.set(day, [...(map.get(day) ?? []), event]));
    });
    return map;
  }, [events]);

  const rows = useMemo(() => events.flatMap((event) => event.assignments.map((assignment, index) => ({ event, assignment, index }))), [events]);

  function resetForm() {
    setEditingId(null);
    setDraft({ ...initialDraft, setupDate: isoToday(), startDate: isoToday(), endDate: isoToday() });
  }

  function updateAssignment(index: number, patch: Partial<Assignment>) {
    setDraft((current) => ({
      ...current,
      assignments: current.assignments.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { ...draft, assignments: draft.assignments.filter((item) => item.salon || item.director || item.cameras || item.vmix || item.volante) };
    const url = editingId ? `/api/events/${editingId}` : "/api/events";
    const method = editingId ? "PUT" : "POST";
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) {
      setMessage("No se pudo guardar. Revisar conexion o base de datos.");
      return;
    }
    const data = await response.json();
    setEvents((current) => (editingId ? current.map((item) => (item.id === editingId ? data.event : item)) : [...current, data.event]));
    setMessage("Cambios guardados");
    resetForm();
  }

  async function removeEvent(id: number) {
    if (id < 0) {
      setEvents((current) => current.filter((item) => item.id !== id));
      return;
    }
    const response = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (response.ok) {
      setEvents((current) => current.filter((item) => item.id !== id));
      setMessage("Evento eliminado");
    }
  }

  function editEvent(event: EventRecord) {
    setEditingId(event.id);
    setDraft({
      orderNumber: event.orderNumber,
      eventName: event.eventName,
      location: event.location,
      setupDate: event.setupDate,
      startDate: event.startDate,
      endDate: event.endDate,
      phase: event.phase,
      color: event.color,
      assignments: event.assignments.length ? event.assignments : [{ ...emptyAssignment }],
    });
  }

  function exportCsv() {
    const header = ["Nro de Orden", "Evento", "Lugar", "Armado", "Inicio", "Fin", "Salones", "Tipo de Servicio CCTV", "Director", "Camarografos", "WP", "Volante", "vMix", "Tipo de vMix", "Estado"];
    const body = rows.map(({ event, assignment }) => [
      event.orderNumber,
      event.eventName,
      event.location,
      formatShort(event.setupDate),
      formatShort(event.startDate),
      formatShort(event.endDate),
      assignment.salon,
      assignment.serviceType,
      assignment.director,
      assignment.cameras,
      assignment.wp ? "SI" : "NO",
      assignment.volante,
      assignment.vmix,
      assignment.vmixType,
      assignment.status,
    ]);
    const csv = [header, ...body].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agenda-cctv-${month.toISOString().slice(0, 7)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="toolbar">
        <div>
          <p className="eyebrow">Congress Rental CCTV</p>
          <h1>Agenda operativa</h1>
          <span className="status-pill">{message}</span>
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mes anterior">‹</button>
          <strong>{monthLabel(month)}</strong>
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mes siguiente">›</button>
          <div className="segmented" aria-label="Vista">
            <button type="button" className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>Calendario</button>
            <button type="button" className={view === "sheet" ? "active" : ""} onClick={() => setView("sheet")}>Planilla</button>
          </div>
          <button type="button" className="primary" onClick={exportCsv}>Exportar CSV</button>
        </div>
      </section>

      <section className="workspace">
        <form className="editor" onSubmit={submit}>
          <div className="editor-head">
            <h2>{editingId ? "Editar evento" : "Nuevo evento"}</h2>
            {editingId && <button type="button" onClick={resetForm}>Cancelar</button>}
          </div>
          <label>Nro de Orden<input required value={draft.orderNumber} onChange={(e) => setDraft({ ...draft, orderNumber: e.target.value })} /></label>
          <label>Evento<input required value={draft.eventName} onChange={(e) => setDraft({ ...draft, eventName: e.target.value.toUpperCase() })} /></label>
          <label>Lugar<input required value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value.toUpperCase() })} /></label>
          <div className="form-grid">
            <label>Armado<input type="date" value={draft.setupDate} onChange={(e) => setDraft({ ...draft, setupDate: e.target.value })} /></label>
            <label>Inicio<input type="date" required value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></label>
            <label>Fin<input type="date" required value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></label>
          </div>
          <label>Dia en calendario
            <select value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value as EventDraft["phase"] })}>
              <option>ARMADO</option>
              <option>EVENTO</option>
              <option>ARMADO + EVENTO</option>
            </select>
          </label>
          <div className="swatches" aria-label="Color del evento">
            {colors.map((color) => (
              <button key={color} type="button" aria-label={`Color ${color}`} className={draft.color === color ? "selected" : ""} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} />
            ))}
          </div>
          <div className="assignments-head">
            <h3>Salones y operadores</h3>
            <button type="button" onClick={() => setDraft({ ...draft, assignments: [...draft.assignments, { ...emptyAssignment }] })}>+ Salon</button>
          </div>
          {draft.assignments.map((assignment, index) => (
            <div className="assignment-editor" key={`${index}-${assignment.salon}`}>
              <input placeholder="Salon" value={assignment.salon} onChange={(e) => updateAssignment(index, { salon: e.target.value.toUpperCase() })} />
              <input placeholder="Tipo de servicio" value={assignment.serviceType} onChange={(e) => updateAssignment(index, { serviceType: e.target.value.toUpperCase() })} />
              <select value={assignment.director} onChange={(e) => updateAssignment(index, { director: e.target.value })}>{operatorOptions.map((name) => <option key={name}>{name}</option>)}</select>
              <input placeholder="Camarografos" value={assignment.cameras} onChange={(e) => updateAssignment(index, { cameras: e.target.value })} />
              <label className="check-line"><input type="checkbox" checked={assignment.wp} onChange={(e) => updateAssignment(index, { wp: e.target.checked })} />Confirmado</label>
              <input placeholder="Volante" value={assignment.volante} onChange={(e) => updateAssignment(index, { volante: e.target.value })} />
              <input placeholder="vMix" value={assignment.vmix} onChange={(e) => updateAssignment(index, { vmix: e.target.value })} />
              <select value={assignment.status} onChange={(e) => updateAssignment(index, { status: e.target.value })}>
                <option>Pendiente</option>
                <option>A confirmar</option>
                <option>Confirmado</option>
                <option>Cerrado</option>
              </select>
            </div>
          ))}
          <button className="primary save" type="submit">{editingId ? "Guardar cambios" : "Agregar evento"}</button>
        </form>

        {view === "calendar" ? (
          <section className="calendar-panel">
            <div className="weekday-row">{["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {monthDays.map((day) => (
                <article className={`day-cell ${day.inMonth ? "" : "muted"}`} key={day.iso}>
                  <b>{day.date.getDate()}</b>
                  {(eventsByDay.get(day.iso) ?? []).map((event) => (
                    <button type="button" className="event-chip" key={`${event.id}-${day.iso}`} style={{ background: event.color, color: isDark(event.color) ? "white" : "black" }} onClick={() => editEvent(event)}>
                      {textFor(event, day.iso)}
                    </button>
                  ))}
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="sheet-panel">
            <table>
              <thead>
                <tr>{["Nro de Orden", "Evento", "Lugar", "Armado", "Inicio", "Fin", "Salones", "Tipo de Servicio CCTV", "Director", "Camarografos", "WP", "Volante", "vMix", "Estado", ""].map((head) => <th key={head}>{head}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(({ event, assignment, index }) => (
                  <tr key={`${event.id}-${index}`} style={{ background: event.color, color: isDark(event.color) ? "white" : "black" }}>
                    <td>{event.orderNumber}</td>
                    <td>{event.eventName}</td>
                    <td>{event.location}</td>
                    <td>{formatShort(event.setupDate)}</td>
                    <td>{formatShort(event.startDate)}</td>
                    <td>{formatShort(event.endDate)}</td>
                    <td>{assignment.salon}</td>
                    <td>{assignment.serviceType}</td>
                    <td>{assignment.director}</td>
                    <td>{assignment.cameras}</td>
                    <td><input type="checkbox" checked={assignment.wp} readOnly /></td>
                    <td>{assignment.volante}</td>
                    <td>{assignment.vmix}</td>
                    <td>{assignment.status}</td>
                    <td className="row-actions"><button type="button" onClick={() => editEvent(event)}>Editar</button><button type="button" onClick={() => removeEvent(event.id)}>Borrar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </section>
    </main>
  );
}
