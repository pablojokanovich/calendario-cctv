import { eventDates, operatorWorksOn, type EventRecord } from "./agenda.ts";
import { canonicalOperatorName, locationFilterKey, normalizeSearchText } from "./event-insights.ts";
import { canonicalServiceName, serviceCategory } from "./services.ts";

export type StatisticsRow = { key: string; name: string; events: number; days: number };
export type StatisticsRange = { from: string; to: string };
export type ServiceGrouping = "configuration" | "category";

const internalStaff = new Set(["pablo jokanovich", "leandro martinez"]);

export function buildStatistics(events: EventRecord[], range: StatisticsRange, serviceGrouping: ServiceGrouping = "configuration") {
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
      const serviceName = serviceGrouping === "category" ? serviceCategory(room.serviceType) : canonicalServiceName(room.serviceType) || "Sin especificar";
      const key = normalizeSearchText(serviceName);
      const service = services.get(key) ?? { name: serviceName, events: new Set<number>(), days: new Set<string>() };
      service.events.add(event.id);
      days.forEach(day => service.days.add(`${event.id}:${day}`));
      services.set(key, service);
      for (const person of Object.values(room.crew).flat()) {
        const name = canonicalOperatorName(person.name);
        const personKey = normalizeSearchText(name);
        const workingDays = days.filter(day => operatorWorksOn(person, day));
        if (!personKey || internalStaff.has(personKey) || !workingDays.length) continue;
        const operator = operators.get(personKey) ?? { name, events: new Set<number>(), days: new Set<string>() };
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
