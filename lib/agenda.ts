export type Operator = { id: string; name: string; confirmed: boolean };
export const roles = ["director", "cameras", "volante", "vmix"] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  director: "Director", cameras: "Camarógrafos", volante: "Volante", vmix: "vMix",
};
export type Assignment = {
  id: string;
  salon: string;
  serviceType: string;
  director: string;
  cameras: string;
  volante: string;
  vmix: string;
  wp: boolean;
  vmixType: string;
  status: string;
  crew: Record<Role, Operator[]>;
};
export type EventDraft = {
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
export type EventRecord = EventDraft & { id: number };
export const colors = ["#ff2a1f", "#ffed00", "#00e51f", "#9a00ff", "#69a0e8", "#f5c8c9", "#f300dc", "#6547a5", "#ffe79a", "#ff9700"];
export const statuses = ["Pendiente", "A confirmar", "Confirmado", "Cerrado"];
export const phases: EventDraft["phase"][] = ["ARMADO", "EVENTO", "ARMADO + EVENTO"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function string(value: unknown) { return typeof value === "string" ? value : ""; }

// Keep grouped notes intact; commas inside parentheses do not denote people.
export function splitOperators(value: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth++;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (!depth && /[,;\n]/.test(char)) {
      if (current.trim()) names.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) names.push(current.trim());
  return names;
}

export function normalizeAssignment(input: unknown, index = 0): Assignment {
  const value = record(input);
  const id = string(value.id) || `room-${index}`;
  const rawCrew = record(value.crew);
  const crew = {} as Assignment["crew"];
  for (const role of roles) {
    const rawPeople = rawCrew[role];
    crew[role] = Array.isArray(rawPeople)
      ? rawPeople.map((person, i) => {
          const p = record(person);
          return { id: string(p.id) || `${id}-${role}-${i}`, name: string(p.name), confirmed: !!string(p.name).trim() && p.confirmed === true };
        })
      : splitOperators(string(value[role])).map((name, i) => ({
          id: `${id}-${role}-${i}`, name, confirmed: role === "cameras" && value.wp === true,
        }));
  }
  return syncCrew({
    id, salon: string(value.salon), serviceType: string(value.serviceType),
    director: "", cameras: "", volante: "", vmix: "", wp: value.wp === true,
    vmixType: string(value.vmixType), status: string(value.status) || "Pendiente", crew,
  });
}

export function syncCrew(assignment: Assignment): Assignment {
  const result = { ...assignment };
  for (const role of roles) result[role] = result.crew[role].map(p => p.name).filter(Boolean).join(", ");
  return result;
}

export function newOperator(): Operator { return { id: crypto.randomUUID(), name: "", confirmed: false }; }
export function newAssignment(): Assignment {
  const assignment = normalizeAssignment({ id: crypto.randomUUID(), serviceType: "CCTV A 2" });
  for (const role of roles) assignment.crew[role] = [newOperator()];
  return assignment;
}
export function dateIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function newDraft(): EventDraft {
  const today = dateIso(new Date());
  return { orderNumber: "", eventName: "", location: "", setupDate: today, startDate: today, endDate: today, phase: "EVENTO", color: colors[4], assignments: [newAssignment()] };
}
export function normalizeEvent(input: unknown): EventRecord {
  const value = record(input);
  const assignments = Array.isArray(value.assignments) && value.assignments.length ? value.assignments.map(normalizeAssignment) : [normalizeAssignment({})];
  return {
    id: Number(value.id), orderNumber: string(value.orderNumber), eventName: string(value.eventName),
    location: string(value.location), setupDate: string(value.setupDate), startDate: string(value.startDate), endDate: string(value.endDate),
    phase: phases.includes(value.phase as EventDraft["phase"]) ? value.phase as EventDraft["phase"] : "EVENTO",
    color: /^#[\da-f]{6}$/i.test(string(value.color)) ? string(value.color) : colors[4], assignments,
  };
}

export function validateEvent(draft: EventDraft): string | null {
  if (!draft.orderNumber.trim() || !draft.eventName.trim() || !draft.location.trim() || !draft.startDate || !draft.endDate) return "Completá número de orden, evento, lugar, inicio y fin.";
  for (const date of [draft.setupDate, draft.startDate, draft.endDate].filter(Boolean)) {
    const parsed = new Date(`${date}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || dateIso(parsed) !== date) return "Revisá las fechas del evento.";
  }
  if (draft.endDate < draft.startDate) return "La fecha de fin debe ser igual o posterior al inicio.";
  return null;
}

export class EventValidationError extends Error {}

export function toPayload(input: unknown) {
  const event = normalizeEvent(input);
  const error = validateEvent(event);
  if (error) throw new EventValidationError(error);
  return {
    orderNumber: event.orderNumber.trim(), eventName: event.eventName.trim(), location: event.location.trim(),
    setupDate: event.setupDate, startDate: event.startDate, endDate: event.endDate,
    phase: event.phase, color: event.color, assignments: JSON.stringify(event.assignments),
    updatedAt: new Date().toISOString(),
  };
}
