import { eventDates, operatorWorksOn, type EventRecord } from "./agenda.ts";
import { locationFilterKey, normalizeSearchText } from "./event-insights.ts";

export type StatisticsRow = { key: string; name: string; events: number; days: number };
export type StatisticsRange = { from: string; to: string };

export function buildStatistics(events: EventRecord[], range: StatisticsRange) {
  const operators = new Map<string, { name: string; events: Set<number>; days: Set<string> }>();
  const locations = new Map<string, { name: string; events: Set<number>; days: Set<string> }>();
  const services = new Map<string, { name: string; events: Set<number>; days: Set<string> }>();
  let eventCount = 0;
  let eventDays = 0;
  const invalidRange = !!(range.from && range.to && range.from > range.to);
  for (const event of invalidRange ? [] : events) {
    const days = eventDates(event).filter(day => (!range.from || day >= range.from) && (!range.to || day <= range.to));
    if (!days.length) continue;
    eventCount++;
    eventDays += days.length;
    const locationKey = locationFilterKey(event.location) || "sin locacion";
    const location = locations.get(locationKey) ?? { name: locationKey.toLocaleUpperCase("es-AR"), events: new Set<number>(), days: new Set<string>() };
    location.events.add(event.id);
    days.forEach(day => location.days.add(`${event.id}:${day}`));
    locations.set(locationKey, location);
    for (const room of event.assignments) {
      const key = normalizeSearchText(room.serviceType) || "sin especificar";
      const service = services.get(key) ?? { name: room.serviceType.trim().replace(/\s+/g, " ").toLocaleUpperCase("es-AR") || "Sin especificar", events: new Set<number>(), days: new Set<string>() };
      service.events.add(event.id);
      days.forEach(day => service.days.add(`${event.id}:${day}`));
      services.set(key, service);
      for (const person of Object.values(room.crew).flat()) {
        const personKey = normalizeSearchText(person.name);
        const workingDays = days.filter(day => operatorWorksOn(person, day));
        if (!personKey || !workingDays.length) continue;
        const operator = operators.get(personKey) ?? { name: person.name.trim().replace(/\s+/g, " "), events: new Set<number>(), days: new Set<string>() };
        operator.events.add(event.id);
        workingDays.forEach(day => operator.days.add(day));
        operators.set(personKey, operator);
      }
    }
  }
  function rows(map: typeof operators): StatisticsRow[] {
    return [...map].map(([key, value]) => ({ key, name: value.name, events: value.events.size, days: value.days.size }))
      .sort((a, b) => b.events - a.events || b.days - a.days || a.name.localeCompare(b.name, "es-AR"));
  }
  return { eventCount, eventDays, operators: rows(operators), locations: rows(locations), services: rows(services), invalidRange };
}
