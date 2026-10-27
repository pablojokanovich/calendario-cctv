import { eventDates, operatorWorksOn, roleLabels, roles, type EventRecord } from "./agenda.ts";
import { canonicalOperatorName, normalizeSearchText } from "./event-insights.ts";

export type OperatorBooking = { eventId: number; order: string; eventName: string; location: string; date: string; rooms: { name: string; roles: string[] }[] };
export type OperatorAgendaEvent = Pick<OperatorBooking, "eventId" | "order" | "eventName" | "location"> & { days: OperatorBooking[] };

export function agendaOperators(events: EventRecord[], catalogue: string[] = []) {
  const names = new Map<string, string>();
  for (const name of [...catalogue, ...events.flatMap(event => event.assignments.flatMap(room => Object.values(room.crew).flat().map(person => person.name)))]) {
    const canonical = canonicalOperatorName(name);
    if (canonical) names.set(normalizeSearchText(canonical), canonical);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "es-AR"));
}

export function operatorAgenda(events: EventRecord[], name: string, from: string, to: string): OperatorBooking[] {
  const key = normalizeSearchText(canonicalOperatorName(name));
  if (!key || (from && to && from > to)) return [];
  return events.flatMap(event => eventDates(event).filter(day => (!from || day >= from) && (!to || day <= to)).flatMap(date => {
    const rooms = event.assignments.flatMap(room => {
      const assigned = roles.filter(role => room.crew[role].some(person => normalizeSearchText(canonicalOperatorName(person.name)) === key && operatorWorksOn(person, date)));
      return assigned.length ? [{ name: room.salon || "Sin sala", roles: assigned.map(role => roleLabels[role]) }] : [];
    });
    return rooms.length ? [{ eventId: event.id, order: event.orderNumber, eventName: event.eventName, location: event.location, date, rooms }] : [];
  })).sort((a, b) => a.date.localeCompare(b.date) || a.eventName.localeCompare(b.eventName, "es-AR") || a.order.localeCompare(b.order));
}

export function groupOperatorAgenda(bookings: OperatorBooking[]): OperatorAgendaEvent[] {
  const events = new Map<number, OperatorAgendaEvent>();
  for (const booking of [...bookings].sort((a, b) => a.date.localeCompare(b.date) || a.eventName.localeCompare(b.eventName, "es-AR") || a.order.localeCompare(b.order))) {
    let event = events.get(booking.eventId);
    if (!event) {
      event = { eventId: booking.eventId, order: booking.order, eventName: booking.eventName, location: booking.location, days: [] };
      events.set(booking.eventId, event);
    }
    event.days.push(booking);
  }
  return [...events.values()];
}

export function operatorAgendaText(name: string, bookings: OperatorBooking[]): string {
  const line = (value: string) => value.trim().replace(/\s+/g, " ");
  return ["CONGRESS RENTAL · CCTV", `Agenda de ${line(canonicalOperatorName(name))}`, ...groupOperatorAgenda(bookings).flatMap(event => [
    "", `${line(event.eventName)} · Orden ${line(event.order)}`, line(event.location).toLocaleUpperCase("es-AR"),
    ...event.days.flatMap(day => [day.date.split("-").reverse().join("/"), ...day.rooms.map(room => `${line(room.name)}: ${room.roles.join(", ")}`)]),
  ])].join("\n");
}
