"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Table2, ChevronLeft, ChevronRight, Download, Plus, Moon, Sun, Save, X, Trash2, Pencil, Check, RefreshCw } from "lucide-react";
import { colors, dateIso, newAssignment, newDraft, newOperator, normalizeEvent, phases, roleLabels, roles, statuses, syncCrew, validateEvent, type Assignment, type EventDraft, type EventRecord, type Operator, type Role } from "../lib/agenda";

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


const sampleEvents = [
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
].map(normalizeEvent);

const localStorageKey = "congress-cctv-agenda-events";
const themeKey = "congress-cctv-theme";
const operatorOptions = ["Lean", "Pablo", "Giuli", "Rodri", "Cami", "Lucas", "Esteban", "Maca", "Paola", "Jero", "Carla"];
type Editing = { id: number | null; data: EventDraft; mode: "form" | "sheet"; dirty: boolean };

function IconButton({ label, children, ...props }: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;
}

function CrewEditor({ role, people, onChange, onFocus, compact = false }: {
  role: Role; people: Operator[]; onChange: (people: Operator[]) => void; onFocus?: () => void; compact?: boolean;
}) {
  function update(id: string, patch: Partial<Operator>) {
    onChange(people.map(person => person.id === id ? { ...person, ...patch } : person));
  }
  return <div className={compact ? "crew-editor compact" : "crew-editor"} role="group" aria-label={roleLabels[role]}>
    {!compact && <div className="crew-heading"><span>{roleLabels[role]}</span><span className="confirmation-label">Confirmado</span></div>}
    {people.map((person, index) => <div className="person-row" key={person.id}>
      <input aria-label={`${roleLabels[role]} ${index + 1}`} placeholder="Nombre" list="operators" value={person.name}
        onFocus={onFocus} onChange={e => update(person.id, { name: e.target.value, confirmed: false })} />
      <input type="checkbox" aria-label={`Confirmar ${roleLabels[role]} ${index + 1}: ${person.name || "sin asignar"}`}
        title={person.confirmed ? "Confirmado" : "Pendiente de confirmación"}
        disabled={!person.name.trim()} checked={person.confirmed}
        onChange={e => update(person.id, { confirmed: e.target.checked })} />
      <IconButton label={`Quitar ${roleLabels[role]} ${index + 1}`} onClick={() => onChange(people.filter(p => p.id !== person.id))}><X size={14} /></IconButton>
    </div>)}
    <button type="button" className="add-person" onClick={() => onChange([...people, newOperator()])}><Plus size={14} />{compact ? "Operador" : "Agregar operador"}</button>
  </div>;
}

function parseDate(value: string) { return new Date(`${value}T12:00:00`); }
function formatShort(value: string) { return value ? parseDate(value).toLocaleDateString("es-AR") : ""; }
function monthLabel(date: Date) { return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" }); }
function darkColor(hex: string) {
  return (parseInt(hex.slice(1, 3), 16) * 299 + parseInt(hex.slice(3, 5), 16) * 587 + parseInt(hex.slice(5, 7), 16) * 114) / 1000 < 145;
}
function phaseFor(event: EventDraft, day: string) {
  const setup = event.setupDate === day;
  const live = day >= event.startDate && day <= event.endDate;
  return setup && live ? "ARMADO / EVENTO" : setup ? "ARMADO" : "EVENTO";
}
function localPreview() { return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname); }
function readLocal(): EventRecord[] | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(localStorageKey) || "null");
    return Array.isArray(saved) ? saved.map(normalizeEvent) : null;
  } catch { return null; }
}
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => null) as { events?: unknown[]; event?: EventRecord; error?: string } | null;
  if (!response.ok || !data) throw new Error(data?.error || "No se pudo conectar con la agenda. Intentá nuevamente.");
  return data;
}
function csvEscape(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export default function AgendaApp() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [view, setView] = useState<"calendar" | "sheet">("calendar");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [message, setMessage] = useState("Cargando agenda compartida...");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusNextForm = useRef(false);

  async function loadEvents() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/events");
      if (!Array.isArray(data.events)) throw new Error("La agenda no respondió correctamente.");
      setEvents(data.events.length ? data.events.map(normalizeEvent) : sampleEvents);
      setLocalMode(false);
      setMessage(data.events.length ? "Agenda sincronizada" : "Datos de ejemplo");
    } catch (err) {
      if (localPreview()) {
        setEvents(readLocal() ?? sampleEvents);
        setLocalMode(true);
        setMessage("Vista local: guardado en este navegador");
      } else {
        setError(err instanceof Error ? err.message : "No se pudo cargar la agenda.");
        setMessage("Sin conexión");
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadEvents(); }, []);
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(themeKey); } catch {}
    const preferred = stored === "dark" || stored === "light" ? stored : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(preferred);
    document.documentElement.dataset.theme = preferred;
  }, []);
  useEffect(() => {
    if (!editing?.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing?.dirty]);
  useEffect(() => {
    if (editing?.mode === "form" && focusNextForm.current) {
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      formRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
      focusNextForm.current = false;
    }
  }, [editing?.mode, editing?.id]);

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(document.modelContext.registerTool({
      name: "create_cctv_event", title: "Crear evento CCTV",
      description: "Crea un evento con fechas, salas y operadores en la agenda compartida.",
      inputSchema: {
        type: "object",
        properties: {
          orderNumber: { type: "string" }, eventName: { type: "string" }, location: { type: "string" },
          setupDate: { type: "string" }, startDate: { type: "string" }, endDate: { type: "string" },
          phase: { type: "string", enum: phases }, color: { type: "string" }, assignments: { type: "array" },
        },
        required: ["orderNumber", "eventName", "location", "startDate", "endDate"], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const payload = normalizeEvent(input);
        const validation = validateEvent(payload);
        if (validation) throw new Error(validation);
        const data = await request("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const event = normalizeEvent(data.event);
        setEvents(current => [...current, event]);
        setMessage("Evento creado");
        return { id: event.id, orderNumber: event.orderNumber, eventName: event.eventName };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const monthDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const leading = (first.getDay() + 6) % 7;
    const count = Math.ceil((leading + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(month.getFullYear(), month.getMonth(), i - leading + 1);
      return { date, iso: dateIso(date), inMonth: date.getMonth() === month.getMonth() };
    });
  }, [month]);

  const rows = events.flatMap(event => {
    const current = editing?.id === event.id && editing.mode === "sheet" ? { ...editing.data, id: event.id } : event;
    return current.assignments.map(assignment => ({ event: current, assignment }));
  });

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(themeKey, next); } catch {}
  }
  function canLeave() {
    return !savingRef.current && (!editing?.dirty || window.confirm("Hay cambios sin guardar. ¿Querés descartarlos?"));
  }
  function beginEdit(event: EventRecord | null, mode: Editing["mode"]) {
    if (editing?.id === event?.id && editing?.mode === mode) return true;
    if (!canLeave()) return false;
    focusNextForm.current = mode === "form";
    setError("");
    setEditing({ id: event?.id ?? null, data: event ? structuredClone(event) : newDraft(), mode, dirty: false });
    return true;
  }
  function cancelEdit() {
    if (canLeave()) { setEditing(null); setError(""); }
  }
  function changeView(next: typeof view) {
    if (next === view || canLeave()) { setView(next); if (next !== view) setEditing(null); }
  }
  function changeDraft(patch: Partial<EventDraft>) {
    setEditing(current => current ? { ...current, data: { ...current.data, ...patch }, dirty: true } : current);
  }
  function changeAssignment(id: string, patch: Partial<Assignment>) {
    setEditing(current => current ? { ...current, dirty: true, data: {
      ...current.data, assignments: current.data.assignments.map(a => a.id === id ? syncCrew({ ...a, ...patch }) : a),
    } } : current);
  }
  function changeSheet(event: EventRecord, update: (draft: EventDraft) => EventDraft) {
    if (editing?.id !== event.id && !canLeave()) return;
    setError("");
    setEditing(current => ({
      id: event.id, mode: "sheet", dirty: true,
      data: update(current?.id === event.id ? current.data : structuredClone(event)),
    }));
  }
  function changeSheetAssignment(event: EventRecord, id: string, patch: Partial<Assignment>) {
    changeSheet(event, draft => ({ ...draft, assignments: draft.assignments.map(a => a.id === id ? syncCrew({ ...a, ...patch }) : a) }));
  }

  async function save() {
    if (!editing || savingRef.current) return;
    const validation = validateEvent(editing.data);
    if (validation) { setError(validation); return; }
    const snapshot = editing;
    const payload = { ...snapshot.data, assignments: snapshot.data.assignments.map(syncCrew) };
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      let event: EventRecord;
      if (localMode) {
        event = { ...payload, id: snapshot.id ?? Date.now() };
        const next = snapshot.id === null ? [...events, event] : events.map(item => item.id === snapshot.id ? event : item);
        window.localStorage.setItem(localStorageKey, JSON.stringify(next));
      } else {
        const existing = snapshot.id !== null && snapshot.id > 0;
        const data = await request(existing ? `/api/events/${snapshot.id}` : "/api/events", {
          method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        if (!data.event?.id) throw new Error("No se pudo verificar el guardado. Tus cambios siguen abiertos.");
        event = normalizeEvent(data.event);
      }
      setEvents(current => snapshot.id === null ? [...current, event] : current.map(item => item.id === snapshot.id ? event : item));
      setMessage(localMode ? "Guardado en este navegador" : "Cambios guardados online");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Tus cambios siguen abiertos.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function removeEvent(event: EventRecord) {
    if (!canLeave() || !window.confirm(`¿Eliminar el evento ${event.orderNumber} - ${event.eventName} y sus salas?`)) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const next = events.filter(item => item.id !== event.id);
      if (localMode) window.localStorage.setItem(localStorageKey, JSON.stringify(next));
      else if (event.id > 0) await request(`/api/events/${event.id}`, { method: "DELETE" });
      setEvents(next);
      setEditing(null);
      setMessage("Evento eliminado");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo eliminar."); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function exportCsv() {
    const header = ["Nro de Orden", "Evento", "Lugar", "Armado", "Inicio", "Fin", "Sala", "Tipo de Servicio CCTV", "Director", "Director confirmado", "Camarógrafos", "Camarógrafos confirmados", "Volante", "Volante confirmado", "vMix", "vMix confirmado", "Tipo de vMix", "Estado"];
    const body = events.flatMap(event => event.assignments.map(a => [
      event.orderNumber, event.eventName, event.location, formatShort(event.setupDate), formatShort(event.startDate), formatShort(event.endDate), a.salon, a.serviceType,
      ...roles.flatMap(role => [a.crew[role].map(p => p.name).join("; "), a.crew[role].filter(p => p.name.trim()).map(p => `${p.name}: ${p.confirmed ? "SI" : "NO"}`).join("; ")]),
      a.vmixType, a.status,
    ]));
    const csv = "\uFEFF" + [header, ...body].map(row => row.map(csvEscape).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `agenda-cctv-${dateIso(month).slice(0, 7)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function sheetField(event: EventRecord, field: keyof Omit<EventDraft, "assignments">, label: string, type = "text") {
    return <input aria-label={`${label} · ${event.orderNumber}`} type={type} value={event[field]}
      onFocus={() => { beginEdit(event, "sheet"); }}
      onChange={e => changeSheet(event, data => ({ ...data, [field]: e.target.value }))} />;
  }
  function assignmentField(event: EventRecord, assignment: Assignment, field: "salon" | "serviceType" | "vmixType", label: string) {
    return <input aria-label={`${label} · ${event.orderNumber}`} value={assignment[field]}
      onFocus={() => { beginEdit(event, "sheet"); }}
      onChange={e => changeSheetAssignment(event, assignment.id, { [field]: e.target.value })} />;
  }
  const draft = editing?.data;

  return <main className="app-shell">
    <datalist id="operators">{operatorOptions.map(name => <option key={name} value={name} />)}</datalist>
    <header className="toolbar">
      <div className="brand"><span className="brand-mark"><CalendarDays size={23} /></span><div><p>Congress Rental · CCTV</p><h1>Agenda operativa</h1></div></div>
      <div className="toolbar-actions">
        <div className="segmented" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === "calendar"} className={view === "calendar" ? "active" : ""} onClick={() => changeView("calendar")}><CalendarDays size={17} />Calendario</button>
          <button type="button" aria-pressed={view === "sheet"} className={view === "sheet" ? "active" : ""} onClick={() => changeView("sheet")}><Table2 size={17} />Planilla</button>
        </div>
        <IconButton label={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"} onClick={toggleTheme}>{theme === "light" ? <Moon size={19} /> : <Sun size={19} />}</IconButton>
        <IconButton label="Exportar CSV" onClick={exportCsv} disabled={loading}><Download size={19} /></IconButton>
        <button type="button" className="primary" disabled={loading || saving} onClick={() => beginEdit(null, "form")}><Plus size={18} />Nuevo evento</button>
      </div>
    </header>
    <div className="view-toolbar">
      {view === "calendar" ? <div className="month-navigation">
        <IconButton label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={20} /></IconButton>
        <h2>{monthLabel(month)}</h2>
        <IconButton label="Mes siguiente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={20} /></IconButton>
      </div> : <h2>Planilla de eventos <span className="count">{events.length}</span></h2>}
      <div className="sync-status"><span role="status">{saving ? "Guardando..." : message}</span><IconButton label="Actualizar agenda" disabled={loading || saving || !!editing?.dirty} onClick={() => void loadEvents()}><RefreshCw size={16} /></IconButton></div>
    </div>
    {error && <div className="error-message" role="alert">{error}</div>}

    {editing && <div className="edit-bar">
      <div><strong>{editing.id === null ? "Nuevo evento" : `Editando ${editing.data.orderNumber}`}</strong><span>{editing.dirty ? "Cambios sin guardar" : "Sin cambios"}</span></div>
      <div className="edit-actions"><button type="button" disabled={saving} onClick={cancelEdit}><X size={17} />Cancelar</button><button type="button" className="primary" disabled={saving} onClick={() => void save()}><Save size={17} />{saving ? "Guardando..." : "Guardar cambios"}</button></div>
    </div>}

    {editing?.mode === "form" && draft && <form ref={formRef} className="editor" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={saving}>
        <div className="event-fields">
          <label>Nro. de orden<input required value={draft.orderNumber} onChange={e => changeDraft({ orderNumber: e.target.value })} /></label>
          <label className="wide-field">Evento<input required value={draft.eventName} onChange={e => changeDraft({ eventName: e.target.value })} /></label>
          <label className="wide-field">Lugar<input required value={draft.location} onChange={e => changeDraft({ location: e.target.value })} /></label>
          <label>Armado<input type="date" value={draft.setupDate} onChange={e => changeDraft({ setupDate: e.target.value })} /></label>
          <label>Inicio<input type="date" required value={draft.startDate} onChange={e => changeDraft({ startDate: e.target.value })} /></label>
          <label>Fin<input type="date" required value={draft.endDate} onChange={e => changeDraft({ endDate: e.target.value })} /></label>
          <label>Día en calendario<select value={draft.phase} onChange={e => changeDraft({ phase: e.target.value as EventDraft["phase"] })}>{phases.map(p => <option key={p}>{p}</option>)}</select></label>
          <div className="color-field"><span>Color del evento</span><div className="swatches">{colors.map(color => <button type="button" key={color} title={`Color ${color}`} aria-label={`Color ${color}`} aria-pressed={draft.color === color} style={{ background: color, color: darkColor(color) ? "#fff" : "#111" }} onClick={() => changeDraft({ color })}>{draft.color === color && <Check size={16} />}</button>)}</div></div>
        </div>
        <div className="assignments-head"><h3>Salas y operadores</h3><button type="button" onClick={() => changeDraft({ assignments: [...draft.assignments, newAssignment()] })}><Plus size={16} />Sala</button></div>
        {draft.assignments.map((assignment, index) => <div className="assignment-editor" key={assignment.id}>
          <div className="room-fields">
            <label>Sala {index + 1}<input placeholder="Nombre de sala (opcional)" value={assignment.salon} onChange={e => changeAssignment(assignment.id, { salon: e.target.value })} /></label>
            <label>Tipo de servicio<input value={assignment.serviceType} onChange={e => changeAssignment(assignment.id, { serviceType: e.target.value })} /></label>
            <label>Tipo de vMix<input value={assignment.vmixType} onChange={e => changeAssignment(assignment.id, { vmixType: e.target.value })} /></label>
            <label>Estado<select value={assignment.status} onChange={e => changeAssignment(assignment.id, { status: e.target.value })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
            <IconButton label={`Quitar sala ${index + 1}`} disabled={draft.assignments.length === 1} onClick={() => changeDraft({ assignments: draft.assignments.filter(a => a.id !== assignment.id) })}><Trash2 size={17} /></IconButton>
          </div>
          <div className="room-crew">{roles.map(role => <CrewEditor key={role} role={role} people={assignment.crew[role]} onChange={people => changeAssignment(assignment.id, { crew: { ...assignment.crew, [role]: people } })} />)}</div>
        </div>)}
        <div className="form-footer"><button type="submit" className="primary"><Save size={17} />{editing.id === null ? "Agregar evento" : "Guardar cambios"}</button></div>
      </fieldset>
    </form>}

    <section className="workspace">
      {view === "calendar" ? <section className="calendar-panel" aria-label="Calendario mensual">
        <div className="calendar-inner">
          <div className="weekday-row">{["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">{monthDays.map(day => <article key={day.iso} className={`day-cell ${day.inMonth ? "" : "muted"} ${day.iso === dateIso(new Date()) ? "today" : ""}`}>
            <time dateTime={day.iso}>{day.date.getDate()}</time>
            {events.filter(event => event.setupDate === day.iso || (day.iso >= event.startDate && day.iso <= event.endDate)).map(event =>
              <button type="button" className="event-chip" key={event.id} style={{ background: event.color, color: darkColor(event.color) ? "#fff" : "#111" }} onClick={() => beginEdit(event, "form")}>
                <strong>{event.orderNumber} · {event.eventName}</strong><span>{event.location}</span>
                {event.assignments.map(a => <span key={a.id}>{[a.salon, a.serviceType].filter(Boolean).join(" · ")}</span>)}
                <small>{phaseFor(event, day.iso)}</small>
              </button>)}
          </article>)}</div>
        </div>
      </section> : <section className="sheet-panel" aria-label="Planilla de eventos">
        <fieldset disabled={saving}>
          <div className="sheet-scroll" tabIndex={0} role="region" aria-label="Planilla editable con desplazamiento horizontal">
            <table>
              <colgroup>{[100, 175, 140, 145, 145, 145, 165, 195, 220, 250, 220, 220, 155, 140, 150, 110].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
              <thead><tr>{["Orden", "Evento", "Lugar", "Armado", "Inicio", "Fin", "Sala", "Servicio CCTV", "Director", "Camarógrafos", "Volante", "vMix", "Tipo de vMix", "Estado", "Día", "Acciones"].map((head, i) => <th key={head} scope="col" className={i < 2 ? `pinned pinned-${i}` : ""}>{head}{i >= 8 && i <= 11 && <small>Nombre / Confirmado</small>}</th>)}</tr></thead>
              <tbody>{rows.map(({ event, assignment }) => <tr key={`${event.id}-${assignment.id}`} className={editing?.id === event.id && editing.mode === "sheet" ? "editing-row" : ""} style={{ "--event-color": event.color } as CSSProperties}>
                <td className="pinned pinned-0 order-cell">{sheetField(event, "orderNumber", "Orden")}<input type="color" className="event-color" aria-label={`Color · ${event.orderNumber}`} value={event.color} onChange={e => changeSheet(event, data => ({ ...data, color: e.target.value }))} /></td>
                <td className="pinned pinned-1">{sheetField(event, "eventName", "Evento")}</td>
                <td>{sheetField(event, "location", "Lugar")}</td>
                <td>{sheetField(event, "setupDate", "Armado", "date")}</td>
                <td>{sheetField(event, "startDate", "Inicio", "date")}</td>
                <td>{sheetField(event, "endDate", "Fin", "date")}</td>
                <td>{assignmentField(event, assignment, "salon", "Sala")}</td>
                <td>{assignmentField(event, assignment, "serviceType", "Servicio")}</td>
                {roles.map(role => <td key={role}><CrewEditor compact role={role} people={assignment.crew[role]} onFocus={() => { beginEdit(event, "sheet"); }} onChange={people => changeSheetAssignment(event, assignment.id, { crew: { ...assignment.crew, [role]: people } })} /></td>)}
                <td>{assignmentField(event, assignment, "vmixType", "Tipo de vMix")}</td>
                <td><select aria-label={`Estado · ${event.orderNumber}`} value={assignment.status} onChange={e => changeSheetAssignment(event, assignment.id, { status: e.target.value })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></td>
                <td><select aria-label={`Día · ${event.orderNumber}`} value={event.phase} onChange={e => changeSheet(event, data => ({ ...data, phase: e.target.value as EventDraft["phase"] }))}>{phases.map(p => <option key={p}>{p}</option>)}</select></td>
                <td><div className="row-actions">
                  <IconButton label={`Editar evento ${event.orderNumber} en planilla`} onClick={() => beginEdit(event, "sheet")}><Pencil size={16} /></IconButton>
                  <IconButton label={`Agregar sala a ${event.orderNumber}`} onClick={() => changeSheet(event, data => ({ ...data, assignments: [...data.assignments, newAssignment()] }))}><Plus size={16} /></IconButton>
                  <IconButton label={`Eliminar sala ${assignment.salon || "sin nombre"} de ${event.orderNumber}`} disabled={event.assignments.length === 1} onClick={() => changeSheet(event, data => ({ ...data, assignments: data.assignments.filter(a => a.id !== assignment.id) }))}><X size={16} /></IconButton>
                  <IconButton label={`Eliminar evento ${event.orderNumber}`} onClick={() => void removeEvent(event)}><Trash2 size={16} /></IconButton>
                </div></td>
              </tr>)}</tbody>
            </table>
            {!rows.length && <p className="empty-state">{loading ? "Cargando eventos..." : "No hay eventos cargados."}</p>}
          </div>
        </fieldset>
      </section>}
    </section>
  </main>;
}
