import type { EventDraft, EventRecord } from "./agenda";

export function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").trim().replace(/\s+/g, " ");
}

const locationColors: Record<string, string> = {
  "cec": "#1d4ed8",
  "sheraton retiro": "#c81e1e",
  "sheraton greenville": "#15803d",
  "greenville": "#15803d",
  "hilton": "#c04b00",
  "ba ferial": "#087eac",
  "rural": "#14532d",
  "la rural": "#14532d",
};

export function calendarLocationColor(location: string): string | null {
  return Object.hasOwn(locationColors, normalizeSearchText(location)) ? locationColors[normalizeSearchText(location)] : null;
}

export function eventMatchesSearch(event: EventDraft, query: string) {
  const text = normalizeSearchText([
    event.orderNumber, event.eventName, event.location, event.setupDate, event.startDate, event.endDate,
    ...event.assignments.flatMap(room => [room.salon, room.serviceType, room.vmixType,
      ...Object.values(room.crew).flatMap(people => people.map(person => person.name))]),
  ].join(" "));
  return normalizeSearchText(query).split(" ").every(term => text.includes(term));
}

type Booking = { eventId: number; eventName: string; orderNumber: string; roomId: string; salon: string };
export type CrewConflict = { operator: string; left: Booking; right: Booking; periods: { start: string; end: string }[] };

function activePeriods(event: EventDraft) {
  const periods = [{ start: event.startDate, end: event.endDate }];
  if (event.setupDate && (event.setupDate < event.startDate || event.setupDate > event.endDate)) {
    periods.push({ start: event.setupDate, end: event.setupDate });
  }
  return periods.filter(period => period.start && period.end && period.start <= period.end);
}

function mergePeriods(periods: { start: string; end: string }[]) {
  const merged: { start: string; end: string }[] = [];
  for (const period of periods.sort((a, b) => a.start.localeCompare(b.start))) {
    const last = merged[merged.length - 1];
    if (last && new Date(`${period.start}T12:00:00Z`).getTime() <= new Date(`${last.end}T12:00:00Z`).getTime() + 86400000) {
      if (period.end > last.end) last.end = period.end;
    } else merged.push({ ...period });
  }
  return merged;
}

export function findCrewConflicts(events: EventRecord[]): CrewConflict[] {
  const bookings = new Map<string, { name: string; booking: Booking; periods: ReturnType<typeof activePeriods> }[]>();
  const conflicts: CrewConflict[] = [];
  for (const event of events) {
    for (const room of event.assignments) {
      const roomPeople = new Map<string, { name: string; periods: ReturnType<typeof activePeriods> }>();
      const active = activePeriods(event);
      for (const person of Object.values(room.crew).flat()) {
        const key = normalizeSearchText(person.name);
        if (!key) continue;
        const periods = person.dates === undefined ? active : person.dates
          .filter(day => active.some(period => period.start <= day && day <= period.end))
          .map(day => ({ start: day, end: day }));
        if (!periods.length) continue;
        const current = roomPeople.get(key);
        roomPeople.set(key, { name: person.name.trim(), periods: [...(current?.periods ?? []), ...periods] });
      }
      for (const [key, person] of roomPeople) {
        const next = {
          name: person.name,
          booking: { eventId: event.id, eventName: event.eventName, orderNumber: event.orderNumber, roomId: room.id, salon: room.salon },
          periods: mergePeriods(person.periods),
        };
        const previous = bookings.get(key) || [];
        for (const other of previous) {
          if (other.booking.eventId === event.id && other.booking.roomId === room.id) continue;
          const overlap = next.periods.flatMap(a => other.periods.flatMap(b => {
            const start = a.start > b.start ? a.start : b.start;
            const end = a.end < b.end ? a.end : b.end;
            return start <= end ? [{ start, end }] : [];
          }));
          if (overlap.length) conflicts.push({ operator: next.name, left: other.booking, right: next.booking, periods: overlap.sort((a, b) => a.start.localeCompare(b.start)) });
        }
        previous.push(next);
        bookings.set(key, previous);
      }
    }
  }
  return conflicts;
}
