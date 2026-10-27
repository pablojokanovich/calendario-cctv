import type { EventDraft, EventRecord } from "./agenda";

export function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").trim().replace(/\s+/g, " ");
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

export function findCrewConflicts(events: EventRecord[]): CrewConflict[] {
  const bookings = new Map<string, { name: string; booking: Booking; periods: ReturnType<typeof activePeriods> }[]>();
  const conflicts: CrewConflict[] = [];
  for (const event of events) {
    for (const room of event.assignments) {
      const seen = new Set<string>();
      for (const person of Object.values(room.crew).flat()) {
        const key = normalizeSearchText(person.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const next = {
          name: person.name.trim(),
          booking: { eventId: event.id, eventName: event.eventName, orderNumber: event.orderNumber, roomId: room.id, salon: room.salon },
          periods: activePeriods(event),
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
