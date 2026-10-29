"use client";
import type { Holiday } from "../lib/holidays";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Table2, BarChart3, Users, Archive, FileSpreadsheet, ChevronLeft, ChevronRight, Download, Plus, Moon, Sun, Save, X, Trash2, Pencil, Check, RefreshCw, ExternalLink, Search, AlertTriangle, FileText, MapPin } from "lucide-react";
import { EventDocuments } from "./EventDocuments";
import { EventShare } from "./EventShare";
import { Statistics } from "./Statistics";
import { OperatorAgenda } from "./OperatorAgenda";
import { BackupPanel } from "./BackupPanel";
import { EventPersonnelExport } from "./EventPersonnelExport";
import { calendarWeeks } from "../lib/calendar-layout";
import { canonicalServiceName, serviceOptions } from "../lib/services";
import { canonicalOperatorName, calendarLocationColor, calendarLocationOptions, locationFilterKey, eventMatchesSearch, findCrewConflicts } from "../lib/event-insights";
import { colors, crewSummary, eventPlannerLink, eventDates, operatorDates, operatorDayLabel, operatorWorksOn, dateIso, newAssignment, newDraft, newOperator, normalizeEvent, phases, roleLabels, roles, statuses, syncCrew, validateEvent, type Assignment, type EventDraft, type EventRecord, type Operator, type Role } from "../lib/agenda";

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
const citationsUrl = "/citaciones.html";
const operatorOptions = [...new Set([
  "Lean", "Pablo", "Giuli", "Rodri", "Camila Diamela", "Esteban", "Maca", "Paola", "Jero", "Carla",
  "Fernando Standke", "Rodrigo Sorribes", "Pablo Daniel Nami", "Fiorella Farias", "Macarena Bultri",
  "Leila Desiree Sucari", "Maximiliano Bultri", "Camila Garcia", "Lucas Andreu", "Giuliana Caroli Carou",
  "Carla Vazquez", "Barbara Sotelo", "Esteban Gomez", "Jeronimo Catalano", "Esteban Santamarina",
  "Noelia Arvallo", "Guido Montini",
].map(canonicalOperatorName))];
const sheetColumnWidths = [76, 130, 110, 98, 98, 98, 120, 150, 165, 185, 145, 150, 112, 96, 164];
const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const fichaTabs = [["datos", "Datos"], ["salas", "Salas y operadores"], ["citaciones", "Citaciones"], ["documentos", "Documentos"]] as const;
type Editing = { id: number | null; data: EventDraft; mode: "form" | "sheet"; dirty: boolean };

function IconButton({ label, children, ...props }: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;
}

function CrewEditor({ event, role, people, onChange, onFocus, compact = false }: {
  event: EventDraft; role: Role; people: Operator[]; onChange: (people: Operator[]) => void; onFocus?: () => void; compact?: boolean;
}) {
  const days = eventDates(event);
  function update(id: string, patch: Partial<Operator>) {
    onChange(people.map(person => person.id === id ? { ...person, ...patch } : person));
  }
  return <div className={compact ? "crew-editor compact" : "crew-editor"} role="group" aria-label={roleLabels[role]}>
    {!compact && <div className="crew-heading"><span>{roleLabels[role]}</span><span className="confirmation-label">Confirmado</span></div>}
    {people.map((person, index) => <div className="person-assignment" key={person.id}><div className="person-row">
      {compact ? <textarea aria-label={`${roleLabels[role]} ${index + 1}`} placeholder="Nombre" rows={2} value={person.name}
        onFocus={onFocus} onChange={e => update(person.id, { name: e.target.value, confirmed: false })} /> :
        <input aria-label={`${roleLabels[role]} ${index + 1}`} placeholder="Nombre" list="operators" value={person.name}
          onFocus={onFocus} onChange={e => update(person.id, { name: e.target.value, confirmed: false })} />}
      <input type="checkbox" aria-label={`Confirmar ${roleLabels[role]} ${index + 1}: ${person.name || "sin asignar"}`}
        title={person.confirmed ? "Confirmado" : "Pendiente de confirmación"}
        disabled={!person.name.trim()} checked={person.confirmed}
        onChange={e => update(person.id, { confirmed: e.target.checked })} />
      <IconButton label={`Quitar ${roleLabels[role]} ${index + 1}`} onClick={() => onChange(people.filter(p => p.id !== person.id))}><X size={14} /></IconButton>
    </div>
      {person.name.trim() && <details className={`operator-days ${person.dates !== undefined ? "custom-days" : ""}`}>
        <summary aria-label={`Días de ${roleLabels[role]} ${index + 1}: ${person.name}`}><CalendarDays size={13} /><span>{person.dates === undefined ? "Todos los días" : `${days.filter(day => operatorWorksOn(person, day)).length}/${days.length} días`}</span></summary>
        <div className="operator-days-options">
          <label><input type="checkbox" aria-label={`Todos los días de ${roleLabels[role]} ${index + 1}: ${person.name}`} checked={days.length > 0 && days.every(day => operatorWorksOn(person, day))} disabled={!days.length}
            onChange={e => update(person.id, { dates: e.target.checked ? undefined : [] })} />Todos los días</label>
          {days.map(day => <label key={day}><input type="checkbox" aria-label={`${roleLabels[role]} ${index + 1}: ${person.name} · ${formatShort(day)}`} checked={operatorWorksOn(person, day)}
            onChange={e => update(person.id, { dates: e.target.checked ? [...new Set([...(person.dates ?? days), day])].sort() : (person.dates ?? days).filter(date => date !== day) })} />
            <span>{formatShort(day)}<small>{phaseFor(event, day)}</small></span></label>)}
          {!days.length && <span>Sin fechas definidas</span>}
        </div>
      </details>}
    </div>)}
    <button type="button" className="add-person" onClick={() => onChange([...people, newOperator()])}><Plus size={14} />{compact ? "Operador" : "Agregar operador"}</button>
  </div>;
}


function parseDate(value: string) { return new Date(`${value}T12:00:00`); }
function formatShort(value: string) { return value ? parseDate(value).toLocaleDateString("es-AR") : ""; }
function monthLabel(date: Date) { return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" }); }
function darkColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722 < 0.179;
}
function phaseFor(event: EventDraft, day: string) {
  const setup = event.setupDate === day;
  const live = day >= event.startDate && day <= event.endDate;
  return setup && live ? "ARMADO / EVENTO" : setup ? "ARMADO" : "EVENTO";
}
function citationPayload(event: EventRecord, selectedAssignment: Assignment) {
  const people = new Map<string, { name: string; role: string; salon: string; confirmed: boolean; days: string[] }>();
  event.assignments.forEach(assignment => {
    roles.forEach(role => assignment.crew[role].forEach(person => {
      const name = person.name.trim();
      const days = operatorDates(event, person);
      if (!name || !days.length) return;
      const key = name.toLocaleLowerCase("es-AR");
      const current = people.get(key);
      people.set(key, {
        name,
        role: current?.role || roleLabels[role],
        salon: [current?.salon, assignment.salon].filter(Boolean).join(current?.salon && assignment.salon ? " / " : ""),
        confirmed: current ? current.confirmed && person.confirmed : person.confirmed,
        days: [...new Set([...(current?.days ?? []), ...days])].sort(),
      });
    }));
  });
  return {
    source: "agenda-cctv",
    orderNumber: event.orderNumber,
    eventName: event.eventName,
    location: event.location.toLocaleUpperCase("es-AR"),
    setupDate: event.setupDate,
    startDate: event.startDate,
    endDate: event.endDate,
    activeDates: eventDates(event),
    selectedAssignmentId: selectedAssignment.id,
    selectedSalon: selectedAssignment.salon,
    selectedService: selectedAssignment.serviceType,
    assignments: event.assignments.map(assignment => ({
      salon: assignment.salon,
      serviceType: assignment.serviceType,
      vmixType: assignment.vmixType,
      status: assignment.status,
      crew: roles.flatMap(role => assignment.crew[role].filter(person => person.name.trim()).map(person => ({
        name: person.name.trim(),
        role: roleLabels[role],
        confirmed: person.confirmed,
        days: operatorDates(event, person),
      }))),
    })),
    people: [...people.values()],
  };
}
function citationLink(event: EventRecord, assignment: Assignment) {
  const firstCitationDate = event.setupDate && event.setupDate < event.startDate ? event.setupDate : event.startDate;
  const params = new URLSearchParams({
    evento: event.eventName,
    orden: event.orderNumber,
    lugar: event.location.toLocaleUpperCase("es-AR"),
    armado: event.setupDate,
    inicio: firstCitationDate,
    eventoInicio: event.startDate,
    fin: event.endDate,
    sala: assignment.salon,
    servicio: assignment.serviceType,
    payload: JSON.stringify(citationPayload(event, assignment)),
  });
  return `${citationsUrl}?${params.toString()}`;
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
function htmlEscape(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
function excelTextCell(value: unknown, style = "Cell") {
  return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${htmlEscape(value)}</Data></Cell>`;
}
function excelStyleId(color: string) {
  return `Event${color.replace("#", "").toUpperCase()}`;
}

export default function AgendaApp() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [view, setView] = useState<"calendar" | "sheet" | "statistics" | "individual">("calendar");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [loadedMonths, setLoadedMonths] = useState(() => [month]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [message, setMessage] = useState("Cargando agenda compartida...");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [savedNotice, setSavedNotice] = useState("");
  const [holidays, setHolidays] = useState<Record<string, Holiday>>({});
  const [holidayError, setHolidayError] = useState("");
  const [holidayRetry, setHolidayRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [personnelExport, setPersonnelExport] = useState<EventRecord | null>(null);
  const [fichaTab, setFichaTab] = useState("datos");
  const [citationsMounted, setCitationsMounted] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusNextForm = useRef(false);
  const calendarRef = useRef<HTMLElement>(null);
  const visibleMonthAnchor = useRef<{ element: Element; top: number } | null>(null);
  const calendarJump = useRef(false);

  function jumpToMonth(date: Date) {
    calendarJump.current = true;
    setMonth(date);
    setLoadedMonths([date]);
  }

  useLayoutEffect(() => {
    if (calendarJump.current && calendarRef.current) {
      calendarJump.current = false;
      window.scrollTo({ top: Math.max(0, window.scrollY + calendarRef.current.getBoundingClientRect().top - 90), behavior: "instant" });
    }
  }, [loadedMonths]);

  useLayoutEffect(() => {
    const anchor = visibleMonthAnchor.current;
    visibleMonthAnchor.current = null;
    if (anchor?.element.isConnected) {
      const delta = anchor.element.getBoundingClientRect().top - anchor.top;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
    }
  }, [month]);

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
    const calendar = calendarRef.current;
    if (!calendar || view !== "calendar" || search.trim() || editing || loading) return;
    let extending = false;
    let frame = 0;
    let previousY = window.scrollY;
    let movingDown = false;
    function updateTimeline() {
      frame = 0;
      const sections = Array.from(calendar!.querySelectorAll<HTMLElement>("[data-calendar-month]"));
      const visible = sections.find(section => section.getBoundingClientRect().bottom > 180);
      if (visible) {
        const date = parseDate(visible.dataset.calendarMonth!);
        if (dateIso(month) !== dateIso(date)) {
          visibleMonthAnchor.current = { element: visible, top: visible.getBoundingClientRect().top };
          setMonth(date);
        }
      }
      if (movingDown && !extending && calendar!.getBoundingClientRect().bottom < window.innerHeight + 350) {
        extending = true;
        setLoadedMonths(current => {
          const last = current[current.length - 1];
          return [...current, new Date(last.getFullYear(), last.getMonth() + 1, 1)];
        });
      }
    }
    function scroll() {
      movingDown = window.scrollY > previousY;
      previousY = window.scrollY;
      if (!frame) frame = window.requestAnimationFrame(updateTimeline);
    }
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      window.cancelAnimationFrame(frame);
    };
  }, [view, search, editing, loading, loadedMonths, month]);
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(themeKey); } catch {}
    const preferred = stored === "dark" || stored === "light" ? stored : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(preferred);
    document.documentElement.dataset.theme = preferred;
  }, []);
  useEffect(() => {
    if (!editing?.dirty && !documentBusy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing?.dirty, documentBusy]);
  useEffect(() => {
    if (editing?.mode === "form" && focusNextForm.current) {
      formRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
      focusNextForm.current = false;
    }
  }, [editing?.mode, editing?.id]);
  useEffect(() => {
    if (!savedNotice) return;
    const timeout = window.setTimeout(() => setSavedNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [savedNotice]);
  useEffect(() => {
    if (editing?.mode !== "form") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !documentBusy && !savingRef.current && (!editing.dirty || window.confirm("Hay cambios sin guardar. ¿Querés descartarlos?"))) {
        setEditing(null);
        setError("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editing, documentBusy]);

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

  function daysForMonth(value: Date) {
    const first = new Date(value.getFullYear(), value.getMonth(), 1);
    const leading = (first.getDay() + 6) % 7;
    const count = Math.ceil((leading + new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(value.getFullYear(), value.getMonth(), i - leading + 1);
      return { date, iso: dateIso(date), inMonth: date.getMonth() === value.getMonth() };
    });
  }
  const monthDays = daysForMonth(month);
  const holidayYears = [...new Set(loadedMonths.flatMap(value => daysForMonth(value).map(day => day.date.getFullYear())))].join(",");
  useEffect(() => {
    const controller = new AbortController();
    setHolidayError("");
    void Promise.all(holidayYears.split(",").map(async year => {
      try {
        const response = await fetch(`/api/holidays?year=${year}`, { signal: controller.signal });
        const data = await response.json() as { holidays?: Holiday[]; error?: string };
        if (!response.ok || !Array.isArray(data.holidays)) throw new Error(data.error || `Feriados: datos no disponibles para ${year}.`);
        return { holidays: data.holidays, error: "" };
      } catch {
        return { holidays: [] as Holiday[], error: `Feriados: datos no disponibles para ${year}.` };
      }
    })).then(results => {
      if (controller.signal.aborted) return;
      setHolidays(Object.fromEntries(results.flatMap(result => result.holidays.map(holiday => [holiday.date, holiday]))));
      setHolidayError(results.map(result => result.error).filter(Boolean).join(" "));
    });
    return () => controller.abort();
  }, [holidayYears, holidayRetry]);

  const todayIso = dateIso(new Date());
  const locationOptions = useMemo(() => calendarLocationOptions(events), [events]);
  const locationEvents = useMemo(() => locationFilter ? events.filter(event => locationFilterKey(event.location) === locationFilter) : events, [events, locationFilter]);
  const calendarDisplayEvents = useMemo(() => locationEvents.map(event => editing?.id === event.id ? { ...editing.data, id: event.id } : event), [locationEvents, editing]);
  const searchResults = search.trim() ? (view === "calendar" ? locationEvents : events).filter(event => eventMatchesSearch(event, search)).sort((a, b) => (a.setupDate || a.startDate).localeCompare(b.setupDate || b.startDate)) : [];
  const insightEvents = editing ? [...events.filter(event => event.id !== editing.id), { ...editing.data, id: editing.id ?? -999999 }] : events;
  const conflicts = findCrewConflicts(insightEvents).filter(conflict => conflict.periods.some(period => period.end >= todayIso) || conflict.left.eventId === editing?.id || conflict.right.eventId === editing?.id);
  const editingConflicts = editing ? conflicts.filter(conflict => conflict.left.eventId === (editing.id ?? -999999) || conflict.right.eventId === (editing.id ?? -999999)) : [];
  const monthStart = dateIso(month);
  const monthEnd = dateIso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const calendarEvents = locationEvents.filter(event => event.endDate >= todayIso && (
    (event.setupDate >= monthStart && event.setupDate <= monthEnd) ||
    (event.startDate <= monthEnd && event.endDate >= monthStart)
  )).sort((a, b) => (a.setupDate || a.startDate).localeCompare(b.setupDate || b.startDate) || a.startDate.localeCompare(b.startDate) || a.orderNumber.localeCompare(b.orderNumber));
  const sheetEvents = events
    .filter(event => event.endDate >= todayIso || (editing?.id === event.id && editing.mode === "sheet"))
    .sort((a, b) => (a.setupDate || a.startDate).localeCompare(b.setupDate || b.startDate) || a.startDate.localeCompare(b.startDate) || a.orderNumber.localeCompare(b.orderNumber));
  const rows = sheetEvents.flatMap(event => {
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
    return !documentBusy && !savingRef.current && (!editing?.dirty || window.confirm("Hay cambios sin guardar. ¿Querés descartarlos?"));
  }
  function beginEdit(event: EventRecord | null, mode: Editing["mode"]) {
    if (editing?.id === event?.id && editing?.mode === mode) return true;
    if (event && editing?.id === event.id && editing.mode === "sheet" && mode === "form") {
      if (documentBusy || savingRef.current) return false;
      focusNextForm.current = true;
      setFichaTab("datos");
      setCitationsMounted(false);
      setEditing(current => current ? { ...current, mode: "form" } : current);
      return true;
    }
    if (!canLeave()) return false;
    focusNextForm.current = mode === "form";
    setError("");
    setSavedNotice("");
    setFichaTab("datos");
    setCitationsMounted(false);
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
    if (documentBusy || savingRef.current) return;
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

  async function save({ keepEditing = false }: { keepEditing?: boolean } = {}) {
    if (!editing || savingRef.current || documentBusy) return;
    const validation = validateEvent(editing.data);
    if (validation) { setError(validation); setFichaTab("datos"); return; }
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
      setSavedNotice(localMode ? "Guardado en este navegador" : "Cambios guardados");
      setEditing(current => {
        if (!keepEditing && snapshot.mode !== "form") return null;
        if (!current || current.id !== snapshot.id || current.mode !== snapshot.mode) return current;
        if (current !== snapshot) return current;
        const savedData: EventDraft = {
          orderNumber: event.orderNumber, eventName: event.eventName, location: event.location,
          setupDate: event.setupDate, startDate: event.startDate, endDate: event.endDate,
          phase: event.phase, color: event.color, assignments: event.assignments,
        };
        return { ...current, id: event.id, data: savedData, dirty: false };
      });
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

  function exportExcel() {
    const header = ["Nro de Orden", "Evento", "Lugar", "Armado", "Inicio", "Fin", "Sala", "Tipo de Servicio CCTV", "Director", "Director confirmado", "Camarógrafos", "Camarógrafos confirmados", "Volante", "Volante confirmado", "vMix", "vMix confirmado", "Estado"];
    const sheetRows = events.flatMap(event => event.assignments.map(a => [
      event.orderNumber, event.eventName, event.location, formatShort(event.setupDate), formatShort(event.startDate), formatShort(event.endDate), a.salon, a.serviceType,
      ...roles.flatMap(role => [a.crew[role].filter(p => p.name.trim()).map(p => `${p.name}${p.dates !== undefined ? ` [${operatorDayLabel(event, p)}]` : ""}`).join("; "), a.crew[role].filter(p => p.name.trim() && operatorDates(event, p).length).map(p => `${p.name}: ${p.confirmed ? "SI" : "NO"}`).join("; ")]),
      a.status,
    ]));
    const usedColors = new Set(events.map(event => event.color));
    const colorStyles = Array.from(usedColors).map(color => `<Style ss:ID="${excelStyleId(color)}"><Font ss:FontName="Arial" ss:Size="10" ss:Color="${darkColor(color) ? "#FFFFFF" : "#000000"}"/><Interior ss:Color="${color}" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>`).join("");
    const planilla = `<Worksheet ss:Name="Planilla"><Table>${header.map((_, index) => `<Column ss:Width="${index >= 8 && index <= 11 ? 145 : 95}"/>`).join("")}<Row>${header.map(item => excelTextCell(item, "Header")).join("")}</Row>${sheetRows.map(row => {
      const event = events.find(item => item.orderNumber === row[0]);
      const style = event ? excelStyleId(event.color) : "Cell";
      return `<Row>${row.map(value => excelTextCell(value, style)).join("")}</Row>`;
    }).join("")}</Table></Worksheet>`;
    const weeks = Array.from({ length: Math.ceil(monthDays.length / 7) }, (_, index) => monthDays.slice(index * 7, index * 7 + 7));
    const calendario = `<Worksheet ss:Name="Calendario"><Table>${weekdays.map(() => `<Column ss:Width="155"/>`).join("")}<Row>${weekdays.map(day => excelTextCell(day, "Header")).join("")}</Row>${weeks.map(week => `<Row ss:Height="95">${week.map(day => {
      const dayEvents = events.filter(event => event.setupDate === day.iso || (day.iso >= event.startDate && day.iso <= event.endDate));
      const entries = dayEvents.map(event => `${event.orderNumber} - ${event.eventName}\n${event.location}\n${event.assignments.map(a => [a.salon, a.serviceType].filter(Boolean).join(" - ")).join("\n")}\n${phaseFor(event, day.iso)}`).join("\n\n");
      const style = dayEvents[0] ? excelStyleId(dayEvents[0].color) : !day.inMonth ? "MutedDay" : day.date.getDay() === 0 || day.date.getDay() === 6 ? "WeekendDay" : "CalendarDay";
      return excelTextCell(`${day.date.getDate()}${entries ? `\n${entries}` : ""}`, style);
    }).join("")}</Row>`).join("")}</Table></Worksheet>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="Cell"><Font ss:FontName="Arial" ss:Size="10"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
<Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#000000"/><Interior ss:Color="#FF9700" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
<Style ss:ID="CalendarDay"><Font ss:FontName="Arial" ss:Size="10"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
<Style ss:ID="WeekendDay"><Font ss:FontName="Arial" ss:Size="10"/><Interior ss:Color="#EEF3F7" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
<Style ss:ID="MutedDay"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#666666"/><Interior ss:Color="#E5E5E5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
${colorStyles}
</Styles>
${planilla}
${calendario}
</Workbook>`;
    const url = URL.createObjectURL(new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `agenda-cctv-${dateIso(month).slice(0, 7)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function sheetField(event: EventRecord, field: keyof Omit<EventDraft, "assignments">, label: string, type = "text") {
    if (type === "text") return <textarea className={field === "location" ? "location-input" : undefined} aria-label={`${label} · ${event.orderNumber}`} rows={2} value={event[field]}
      onFocus={() => { beginEdit(event, "sheet"); }}
      onChange={e => changeSheet(event, data => ({ ...data, [field]: e.target.value }))} />;
    return <input aria-label={`${label} · ${event.orderNumber}`} type={type} value={event[field]}
      onFocus={() => { beginEdit(event, "sheet"); }}
      onChange={e => changeSheet(event, data => ({ ...data, [field]: e.target.value }))} />;
  }
  function assignmentField(event: EventRecord, assignment: Assignment, field: "salon" | "serviceType" | "vmixType", label: string) {
    return <textarea aria-label={`${label} · ${event.orderNumber}`} rows={2} value={assignment[field]}
      onFocus={() => { beginEdit(event, "sheet"); }}
      onChange={e => changeSheetAssignment(event, assignment.id, { [field]: e.target.value })}
      onBlur={field === "serviceType" ? e => { const value = canonicalServiceName(e.target.value); if (value !== e.target.value) changeSheetAssignment(event, assignment.id, { serviceType: value }); } : undefined} />;
  }
  const draft = editing?.data;
  function conflictList(items: typeof conflicts) {
    return <ul className="conflict-list">{items.map((conflict, index) => <li key={`${conflict.operator}-${conflict.left.eventId}-${conflict.left.roomId}-${conflict.right.eventId}-${conflict.right.roomId}-${index}`}>
      <strong>{conflict.operator}</strong><span className="conflict-dates">{conflict.periods.map(period => period.start === period.end ? formatShort(period.start) : `${formatShort(period.start)} al ${formatShort(period.end)}`).join(" · ")}</span>
      <div className="conflict-bookings">{[conflict.left, conflict.right].map((booking, side) => <button type="button" key={side} disabled={documentBusy || booking.eventId === -999999} onClick={() => { const event = events.find(event => event.id === booking.eventId); if (event) beginEdit(event, "form"); }}>
        #{booking.orderNumber} · {booking.eventName}{booking.salon ? ` · ${booking.salon}` : ""}
      </button>)}</div>
    </li>)}</ul>;
  }

  return <main className={`app-shell${view === "calendar" && !search.trim() ? " calendar-view" : ""}${editing?.mode === "form" ? " has-editor" : ""}`}>
    <datalist id="operators">{operatorOptions.map(name => <option key={name} value={name} />)}</datalist>
    <datalist id="services">{serviceOptions.map(name => <option key={name} value={name} />)}</datalist>
    <header className="toolbar">
      <div className="brand"><img className="brand-logo" src="/congress-rental-logo.jpg" alt="Congress Rental" width={44} height={44} /><div><p>Congress Rental · CCTV</p><h1>Agenda operativa</h1></div></div>
      <div className="toolbar-actions">
        <div className="segmented" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === "calendar"} className={view === "calendar" ? "active" : ""} onClick={() => changeView("calendar")}><CalendarDays size={17} />Calendario</button>
          <button type="button" aria-pressed={view === "sheet"} className={view === "sheet" ? "active" : ""} onClick={() => changeView("sheet")}><Table2 size={17} />Planilla</button>
          <button type="button" aria-pressed={view === "statistics"} className={view === "statistics" ? "active" : ""} onClick={() => changeView("statistics")}><BarChart3 size={17} />Estadísticas</button>
          <button type="button" aria-pressed={view === "individual"} className={view === "individual" ? "active" : ""} onClick={() => changeView("individual")}><Users size={17} />Agenda individual</button>
        </div>
        <IconButton label={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"} onClick={toggleTheme}>{theme === "light" ? <Moon size={19} /> : <Sun size={19} />}</IconButton>
        <IconButton label="Exportar Excel con planilla y calendario" onClick={exportExcel} disabled={loading}><Download size={19} /></IconButton>
        <IconButton label="Respaldo completo y restauración" onClick={() => setBackupOpen(true)} disabled={loading || saving || documentBusy || localMode || !!editing?.dirty}><Archive size={19} /></IconButton>
        <button type="button" className="primary" disabled={loading || saving || documentBusy} onClick={() => beginEdit(null, "form")}><Plus size={18} />Nuevo evento</button>
      </div>
    </header>
    <div className="view-toolbar">
      {view === "calendar" ? <div className="month-navigation">
        <IconButton label="Mes anterior" onClick={() => jumpToMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={20} /></IconButton>
        <h2 aria-live="polite" aria-atomic="true">{monthLabel(month)}</h2>
        <IconButton label="Mes siguiente" onClick={() => jumpToMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={20} /></IconButton>
        <button type="button" className="today-button" onClick={() => jumpToMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoy</button>
      </div> : view === "sheet" ? <h2>Planilla de eventos <span className="count">{sheetEvents.length}</span></h2> : <h2>{view === "individual" ? "Agenda individual" : "Estadísticas"}</h2>}
      <div className="sync-status"><span role="status">{saving ? "Guardando..." : message}</span><IconButton label="Actualizar agenda" disabled={loading || saving || documentBusy || !!editing?.dirty} onClick={() => void loadEvents()}><RefreshCw size={16} /></IconButton></div>
    </div>
    {(view === "calendar" || view === "sheet") && <div className="search-toolbar"><label className="agenda-search"><Search size={17} /><input type="search" aria-label="Buscar eventos" placeholder="Buscar evento, orden, lugar, sala u operador" value={search} onChange={event => setSearch(event.target.value)} />{search && <IconButton label="Limpiar búsqueda" onClick={() => setSearch("")}><X size={16} /></IconButton>}</label>
      {view === "calendar" && <div className="location-filter"><label><MapPin size={16} /><select aria-label="Filtrar calendario por locación" value={locationFilter} onChange={event => setLocationFilter(event.target.value)}>
        <option value="">Todas las locaciones</option>
        {locationOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        {locationFilter && !locationOptions.some(option => option.value === locationFilter) && <option value={locationFilter}>{locationFilter.toLocaleUpperCase("es-AR")}</option>}
      </select></label>{locationFilter && <IconButton label="Mostrar todas las locaciones" onClick={() => setLocationFilter("")}><X size={16} /></IconButton>}</div>}
      {search.trim() && <span className="search-count">{searchResults.length} resultados · Incluye eventos anteriores</span>}
    </div>}
    {conflicts.length > 0 && <details className="conflict-panel"><summary><AlertTriangle size={17} />{conflicts.length} {conflicts.length === 1 ? "posible cruce de operadores" : "posibles cruces de operadores"}</summary><p>Coincidencias de fecha, incluyendo armado. Horarios no verificados.</p>{conflictList(conflicts)}</details>}
    {error && <div className="error-message" role="alert">{error}</div>}
    {view === "calendar" && holidayError && <div className="holiday-status" role="status"><span>{holidayError}</span><IconButton label="Reintentar carga de feriados" onClick={() => setHolidayRetry(current => current + 1)}><RefreshCw size={14} /></IconButton></div>}

    {editing?.mode === "sheet" && editing.dirty && <div className="edit-bar">
      <div><strong>{editing.id === null ? "Nuevo evento" : `Editando ${editing.data.orderNumber}`}</strong><span>{saving ? "Guardando..." : editing.dirty ? "Cambios sin guardar" : editing.id === null ? "Sin cambios" : "Guardado"}</span></div>
      <div className="edit-actions"><button type="button" disabled={saving} onClick={cancelEdit}><X size={17} />Cancelar</button><button type="button" className="primary" disabled={saving || (editing.id !== null && !editing.dirty)} onClick={() => void save()}>{editing.id !== null && !editing.dirty ? <Check size={17} /> : <Save size={17} />}{saving ? "Guardando..." : editing.id !== null && !editing.dirty ? "Guardado" : "Guardar ahora"}</button></div>
    </div>}

    {editing?.mode === "form" && draft && <aside className="editor-panel" aria-labelledby="editor-title">
      <div className="editor-header"><div className="ficha-brand"><img src="/congress-rental-logo.jpg" alt="Congress Rental" width={44} height={44} /><div><p>{editing.id === null ? "Nuevo evento" : `Ficha del evento · Orden ${draft.orderNumber}`}</p><h2 id="editor-title">{draft.eventName || "Ficha del evento"}</h2></div></div><IconButton label="Cerrar ficha" disabled={saving || documentBusy} onClick={cancelEdit}><X size={20} /></IconButton></div>
      <div className="ficha-summary"><span className="location-text">{draft.location || "Lugar sin completar"}</span><span>Armado: {formatShort(draft.setupDate || draft.startDate)}</span><span>{crewSummary(draft).confirmed} de {crewSummary(draft).total} operadores confirmados</span></div>
      <div className="ficha-navigation"><div className="ficha-tabs" role="tablist" aria-label="Secciones del evento">{fichaTabs.map(([key, label], index) => <button type="button" role="tab" key={key} id={`ficha-tab-${key}`} aria-selected={fichaTab === key} aria-controls={`ficha-panel-${key}`} tabIndex={fichaTab === key ? 0 : -1} onClick={() => { setFichaTab(key); if (key === "citaciones") setCitationsMounted(true); }} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? fichaTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + fichaTabs.length) % fichaTabs.length;
        setFichaTab(fichaTabs[next][0]);
        if (fichaTabs[next][0] === "citaciones") setCitationsMounted(true);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }}>{label}</button>)}</div><a className="ficha-external-link" href={eventPlannerLink({ ...draft, id: editing.id })} target="_blank" rel="noreferrer" title="Abrir el generador original con los datos del evento"><ExternalLink size={15} />Equipos y remitos</a></div>
      <form ref={formRef} noValidate className="editor" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }}>
      {error && <div className="error-message">{error}</div>}
      <fieldset disabled={saving || documentBusy}>
        {editingConflicts.length > 0 && <details className="conflict-panel editor-conflicts" open><summary><AlertTriangle size={16} />Posibles cruces de operadores</summary>{conflictList(editingConflicts)}</details>}
        <section className="ficha-panel" role="tabpanel" id="ficha-panel-datos" aria-labelledby="ficha-tab-datos" hidden={fichaTab !== "datos"}>
        <div className="event-fields">
          <label>Nro. de orden<input required value={draft.orderNumber} onChange={e => changeDraft({ orderNumber: e.target.value })} /></label>
          <label className="wide-field">Evento<input required value={draft.eventName} onChange={e => changeDraft({ eventName: e.target.value })} /></label>
          <label className="wide-field">Lugar<input className="location-input" required value={draft.location} onChange={e => changeDraft({ location: e.target.value })} /></label>
          <label>Armado<input type="date" value={draft.setupDate} onChange={e => changeDraft({ setupDate: e.target.value })} /></label>
          <label>Inicio<input type="date" required value={draft.startDate} onChange={e => changeDraft({ startDate: e.target.value })} /></label>
          <label>Fin<input type="date" required value={draft.endDate} onChange={e => changeDraft({ endDate: e.target.value })} /></label>
          <label>Día en calendario<select value={draft.phase} onChange={e => changeDraft({ phase: e.target.value as EventDraft["phase"] })}>{phases.map(p => <option key={p}>{p}</option>)}</select></label>
          <div className="color-field"><span>Color del evento</span><div className="swatches">{colors.map(color => <button type="button" key={color} title={`Color ${color}`} aria-label={`Color ${color}`} aria-pressed={draft.color === color} style={{ background: color, color: darkColor(color) ? "#fff" : "#111" }} onClick={() => changeDraft({ color })}>{draft.color === color && <Check size={16} />}</button>)}</div></div>
        </div>
        </section>
        <section className="ficha-panel" role="tabpanel" id="ficha-panel-salas" aria-labelledby="ficha-tab-salas" hidden={fichaTab !== "salas"}>
        <div className="assignments-head"><h3>Salas y operadores</h3><button type="button" onClick={() => changeDraft({ assignments: [...draft.assignments, newAssignment()] })}><Plus size={16} />Agregar sala</button></div>
        <EventShare key={editing.id ?? "new"} event={draft} />
        {draft.assignments.map((assignment, index) => <div className="assignment-editor" key={assignment.id}>
          <div className="room-fields">
            <label>Sala {index + 1}<input placeholder="Nombre de sala (opcional)" value={assignment.salon} onChange={e => changeAssignment(assignment.id, { salon: e.target.value })} /></label>
            <label>Tipo de servicio<input list="services" value={assignment.serviceType} onChange={e => changeAssignment(assignment.id, { serviceType: e.target.value })} onBlur={e => { const value = canonicalServiceName(e.target.value); if (value !== e.target.value) changeAssignment(assignment.id, { serviceType: value }); }} /></label>
            <label>Tipo de vMix<input value={assignment.vmixType} onChange={e => changeAssignment(assignment.id, { vmixType: e.target.value })} /></label>
            <label>Estado<select value={assignment.status} onChange={e => changeAssignment(assignment.id, { status: e.target.value })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
            <IconButton label={`Quitar sala ${index + 1}`} disabled={draft.assignments.length === 1} onClick={() => changeDraft({ assignments: draft.assignments.filter(a => a.id !== assignment.id) })}><Trash2 size={17} /></IconButton>
          </div>
          <div className="room-crew">{roles.map(role => <CrewEditor key={role} event={draft} role={role} people={assignment.crew[role]} onChange={people => changeAssignment(assignment.id, { crew: { ...assignment.crew, [role]: people } })} />)}</div>
        </div>)}
        </section>
        <section className="ficha-panel" role="tabpanel" id="ficha-panel-documentos" aria-labelledby="ficha-tab-documentos" hidden={fichaTab !== "documentos"}><EventDocuments key={editing.id ?? "new"} eventId={editing.id} localMode={localMode} onBusyChange={setDocumentBusy} /></section>
        <section className="ficha-panel" role="tabpanel" id="ficha-panel-citaciones" aria-labelledby="ficha-tab-citaciones" hidden={fichaTab !== "citaciones"}>
          <div className="workspace-heading"><h3>Citaciones del evento</h3><a className="ficha-citation-link" href={citationLink({ ...draft, id: editing.id ?? -999999 }, draft.assignments[0])} target="_blank" rel="noreferrer"><ExternalLink size={15} />Abrir generador</a></div>
          {citationsMounted && <iframe className="citation-frame" title={`Citaciones de ${draft.eventName || "evento"}`} src={citationLink({ ...draft, id: editing.id ?? -999999 }, draft.assignments[0])} />}
        </section>
        <div className="form-footer"><span>{documentBusy || saving ? "Guardando..." : editing.dirty ? "Cambios sin guardar" : "Sin cambios"}</span><button type="button" onClick={cancelEdit}>Cerrar</button><button type="submit" className="primary" disabled={saving || documentBusy || (editing.id !== null && !editing.dirty)}><Save size={17} />{saving ? "Guardando..." : editing.id === null ? "Agregar evento" : "Guardar ficha"}</button></div>
      </fieldset>
    </form></aside>}
    {savedNotice && <div className="save-notice" role="status"><Check size={17} />{savedNotice}</div>}

    <section className="workspace">
      {view === "individual" ? <OperatorAgenda events={events} catalogue={operatorOptions} /> : view === "statistics" ? <Statistics events={events} loading={loading} /> : search.trim() ? <section className="search-results" aria-label="Resultados de búsqueda"><h2>Resultados de búsqueda <span className="count">{searchResults.length}</span></h2>
        <ul>{searchResults.map(event => <li key={event.id}><button type="button" className="search-result" style={{ "--event-color": event.color } as CSSProperties} disabled={documentBusy} onClick={() => { if (beginEdit(event, "form")) { const date = parseDate(event.setupDate || event.startDate); jumpToMonth(new Date(date.getFullYear(), date.getMonth(), 1)); } }}>
          <span className="search-result-order">#{event.orderNumber}</span><strong>{event.eventName}</strong><span>{event.location}</span><span>{formatShort(event.setupDate || event.startDate)} — {formatShort(event.endDate)}</span><span className="search-result-rooms">{event.assignments.map(room => room.salon).filter(Boolean).join(" · ")}</span>{event.endDate < todayIso && <small>Finalizado</small>}
        </button></li>)}</ul>{!searchResults.length && <p className="empty-state">No se encontraron eventos.</p>}
      </section> : view === "calendar" ? <div className="calendar-layout">
        <aside className="event-overview" aria-labelledby="event-overview-title">
          <div className="event-overview-heading"><h2 id="event-overview-title">Eventos del mes</h2><span>{calendarEvents.length}</span></div>
          <ol className="event-overview-list">{calendarEvents.map(event => {
            const summary = crewSummary(event);
            return <li key={event.id}><button type="button" className={`event-overview-item${editing?.id === event.id ? " is-selected" : ""}`} style={{ "--event-color": event.color } as CSSProperties} onClick={() => beginEdit(event, "form")} aria-label={`Editar ${event.eventName}, orden ${event.orderNumber}`}>
              <span className="overview-order">#{event.orderNumber}</span>
              <strong>{event.eventName}</strong><span className="overview-location">{event.location}</span>
              <span className="overview-date">{event.setupDate ? "Armado" : "Inicio"} <time dateTime={event.setupDate || event.startDate}>{formatShort(event.setupDate || event.startDate)}</time></span>
              {summary.total ? <span className="overview-confirmations"><span className="overview-confirmed"><Check size={13} />{summary.confirmed} {summary.confirmed === 1 ? "confirmado" : "confirmados"}</span><span className={summary.pending ? "overview-pending" : "overview-complete"}>{summary.pending} por confirmar</span></span> : <span className="overview-unassigned">Sin operadores asignados</span>}
              {conflicts.some(conflict => conflict.left.eventId === event.id || conflict.right.eventId === event.id) && <span className="overview-pending"><AlertTriangle size={12} /> Posible cruce de operadores</span>}
            </button></li>;
          })}</ol>
          {!calendarEvents.length && <p className="overview-empty">{loading ? "Cargando eventos..." : locationFilter ? "No hay eventos vigentes este mes en esta locación." : "No hay eventos vigentes este mes."}</p>}
        </aside>
        <section ref={calendarRef} className="calendar-timeline" aria-label="Calendario mensual">
        {loadedMonths.map(value => <section className="calendar-panel" key={dateIso(value)} data-calendar-month={dateIso(value)} aria-label={monthLabel(value)}>
        <h3 className="calendar-month-title">{monthLabel(value)}</h3>
        <div className="calendar-inner">
          <div className="weekday-row">{weekdays.map((day, index) => <span key={day} className={index >= 5 ? "weekend-head" : ""}>{day}</span>)}</div>
          <div className="calendar-grid">{calendarWeeks(daysForMonth(value), calendarDisplayEvents, dateIso(value)).map(week => <div className="calendar-week" key={week.days[0].iso} style={{ gridTemplateRows: `auto ${week.laneCount ? `repeat(${week.laneCount}, auto) ` : ""}minmax(16px, 1fr)` }}>{week.days.map((day, column) => day.iso < dateIso(value) ? <div key={day.iso} className="day-cell calendar-empty" aria-hidden="true" style={{ gridColumn: column + 1, gridRow: `1 / span ${week.laneCount + 2}` }} /> : <article key={day.iso} data-calendar-date={day.iso} style={{ gridColumn: column + 1, gridRow: `1 / span ${week.laneCount + 2}` }} className={`day-cell ${day.date.getDay() === 0 || day.date.getDay() === 6 ? "weekend" : ""} ${day.inMonth ? "" : "muted"} ${day.iso === todayIso ? "today" : ""} ${holidays[day.iso] ? holidays[day.iso].nonWorking ? "non-working" : "holiday" : ""}`}>
            <div className="calendar-day-header">
            <div className="day-heading">{day.iso === todayIso && <span className="today-label">HOY</span>}<time dateTime={day.iso} aria-current={day.iso === todayIso ? "date" : undefined}>{day.date.getDate()}</time></div>
            {holidays[day.iso] && <div className="holiday-label" title={holidays[day.iso].name}><b>{holidays[day.iso].nonWorking ? "No laborable" : "Feriado"}</b><span>{holidays[day.iso].name}</span></div>}
            </div>
            {week.entries.filter(entry => entry.columns.includes(column)).map(({ event, lane, columns }) =>
              <div className={`calendar-event ${columns.includes(column - 1) ? "continues-before" : ""} ${columns.includes(column + 1) ? "continues-after" : ""}`} key={event.id} data-calendar-event={event.id} style={{ gridRow: lane + 2 }}>
              <button type="button" className="event-chip" style={{ background: event.color, color: darkColor(event.color) ? "#fff" : "#111" }} onClick={() => beginEdit(event, "form")}>
                <span className="calendar-order">#{event.orderNumber}</span><strong>{event.eventName}</strong><span className="calendar-location" style={{ backgroundColor: calendarLocationColor(event.location) ?? "transparent", color: calendarLocationColor(event.location) ? "#fff" : "inherit" }}>{event.location}</span>
                {event.assignments.map(assignment => <span className="calendar-room" key={assignment.id}>
                  <span className="calendar-room-name">{assignment.salon}</span><span className="calendar-service">{assignment.serviceType}</span>
                  {roles.map(role => {
                    const people = assignment.crew[role].filter(person => person.name.trim() && operatorWorksOn(person, day.iso));
                    return people.length > 0 && <span className="calendar-crew" key={role}>
                      <b>{roleLabels[role]}: </b>
                      {people.map((person, index) => <span key={person.id}>
                        {index > 0 && ", "}{person.name.trim()}
                        {person.confirmed && <Check size={12} className="calendar-confirmed" aria-label="Confirmado" />}
                      </span>)}
                    </span>;
                  })}
                </span>)}
                <span className="calendar-badges"><small className="phase-badge">{phaseFor(event, day.iso)}</small>
                  {conflicts.some(conflict => (conflict.left.eventId === event.id || conflict.right.eventId === event.id) && conflict.periods.some(period => period.start <= day.iso && period.end >= day.iso)) && <small className="pending-badge"><AlertTriangle size={10} /> Posible cruce</small>}
                  {event.assignments.some(a => roles.some(role => a.crew[role].some(person => person.name.trim() && operatorWorksOn(person, day.iso) && !person.confirmed))) && <small className="pending-badge">Operadores por confirmar</small>}
                </span>
              </button><input type="color" className="calendar-event-color" title={`Cambiar color · ${event.eventName}`} aria-label={`Color del evento · ${event.orderNumber} · ${day.iso}`} value={event.color} disabled={saving || documentBusy} onChange={e => editing?.id === event.id && editing.mode === "form" ? changeDraft({ color: e.target.value }) : changeSheet(event, draft => ({ ...draft, color: e.target.value }))} />
              </div>)}
          </article>)}</div>)}</div>
        </div>
      </section>)}</section></div> : <section className="sheet-panel" aria-label="Planilla de eventos">
        <fieldset disabled={saving || documentBusy}>
          <div className="sheet-scroll" tabIndex={0} role="region" aria-label="Planilla editable con desplazamiento horizontal">
            <table>
              <colgroup>{sheetColumnWidths.map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
              <thead><tr>{["Orden", "Evento", "Lugar", "Armado", "Inicio", "Fin", "Sala", "Servicio CCTV", "Director", "Camarógrafos", "Volante", "vMix", "Estado", "Día", "Acciones"].map((head, i) => <th key={head} scope="col" className={i < 2 ? `pinned pinned-${i}` : ""}>{head}{i >= 8 && i <= 11 && <small>Nombre / Confirmado</small>}</th>)}</tr></thead>
              <tbody>{rows.map(({ event, assignment }) => <tr key={`${event.id}-${assignment.id}`} className={editing?.id === event.id && editing.mode === "sheet" ? "editing-row" : ""} style={{ "--event-color": event.color, "--event-ink": darkColor(event.color) ? "#fff" : "#000", colorScheme: darkColor(event.color) ? "dark" : "light" } as CSSProperties}>
                <td className="pinned pinned-0 order-cell">{sheetField(event, "orderNumber", "Orden")}<input type="color" className="event-color" aria-label={`Color · ${event.orderNumber}`} value={event.color} onChange={e => changeSheet(event, data => ({ ...data, color: e.target.value }))} /></td>
                <td className="pinned pinned-1">{sheetField(event, "eventName", "Evento")}</td>
                <td>{sheetField(event, "location", "Lugar")}</td>
                <td>{sheetField(event, "setupDate", "Armado", "date")}</td>
                <td>{sheetField(event, "startDate", "Inicio", "date")}</td>
                <td>{sheetField(event, "endDate", "Fin", "date")}</td>
                <td>{assignmentField(event, assignment, "salon", "Sala")}</td>
                <td>{assignmentField(event, assignment, "serviceType", "Servicio")}</td>
                {roles.map(role => <td key={role}><CrewEditor compact key={role} event={event} role={role} people={assignment.crew[role]} onFocus={() => { beginEdit(event, "sheet"); }} onChange={people => changeSheetAssignment(event, assignment.id, { crew: { ...assignment.crew, [role]: people } })} /></td>)}
                <td><select aria-label={`Estado · ${event.orderNumber}`} value={assignment.status} onChange={e => changeSheetAssignment(event, assignment.id, { status: e.target.value })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></td>
                <td><select aria-label={`Día · ${event.orderNumber}`} value={event.phase} onChange={e => changeSheet(event, data => ({ ...data, phase: e.target.value as EventDraft["phase"] }))}>{phases.map(p => <option key={p}>{p}</option>)}</select></td>
                <td><div className="row-actions">
                  {assignment.id === event.assignments[0]?.id && <IconButton label={`Exportar Excel de personal ${event.orderNumber}`} onClick={() => setPersonnelExport(structuredClone(event))}><FileSpreadsheet size={16} /></IconButton>}
                  <IconButton label={`Editar evento ${event.orderNumber} en planilla`} onClick={() => beginEdit(event, "sheet")}><Pencil size={16} /></IconButton>
                  <IconButton label={`Orden de servicio y detalles ${event.orderNumber}`} onClick={() => beginEdit(event, "form")}><FileText size={16} /></IconButton>
                  <a className="sheet-citation-link" href={citationLink(event, assignment)} target="_blank" rel="noreferrer" title={`Crear citaciones para ${event.orderNumber}`}><ExternalLink size={15} />Citaciones</a>
                  <button type="button" className="sheet-add-room" title={`Agregar sala a ${event.orderNumber}`} onClick={() => changeSheet(event, data => ({ ...data, assignments: [...data.assignments, newAssignment()] }))}><Plus size={15} />Sala</button>
                  <IconButton label={`Eliminar sala ${assignment.salon || "sin nombre"} de ${event.orderNumber}`} disabled={event.assignments.length === 1} onClick={() => changeSheet(event, data => ({ ...data, assignments: data.assignments.filter(a => a.id !== assignment.id) }))}><X size={16} /></IconButton>
                  <IconButton label={`Eliminar evento ${event.orderNumber}`} onClick={() => void removeEvent(event)}><Trash2 size={16} /></IconButton>
                </div></td>
              </tr>)}</tbody>
            </table>
            {!rows.length && <p className="empty-state">{loading ? "Cargando eventos..." : "No hay eventos vigentes en la planilla."}</p>}
          </div>
        </fieldset>
      </section>}
    </section>
    {personnelExport && <EventPersonnelExport event={personnelExport} onClose={() => setPersonnelExport(null)} />}
    {backupOpen && <BackupPanel theme={theme} catalogue={{ operators: operatorOptions, services: serviceOptions }} onClose={() => setBackupOpen(false)} onBusyChange={setDocumentBusy} onRestored={async () => { setEditing(null); await loadEvents(); }} onTheme={next => { setTheme(next); document.documentElement.dataset.theme = next; try { localStorage.setItem(themeKey, next); } catch {} }} />}
  </main>;
}
