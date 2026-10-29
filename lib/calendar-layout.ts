import type { EventRecord } from "./agenda.ts";

export type CalendarDay = { date: Date; iso: string; inMonth: boolean };
export type CalendarEntry = { event: EventRecord; lane: number; columns: number[] };

// Reserve the same lane across a week's days, including gaps before the event.
export function calendarWeeks(days: CalendarDay[], events: EventRecord[], monthStart: string) {
  const weeks: { days: CalendarDay[]; entries: CalendarEntry[]; laneCount: number }[] = [];
  let continuing = new Map<number, number>();
  for (let offset = 0; offset < days.length; offset += 7) {
    const weekDays = days.slice(offset, offset + 7);
    const candidates = events.flatMap(event => {
      const columns = weekDays.flatMap((day, index) => day.iso >= monthStart && (day.iso === event.setupDate || (day.iso >= event.startDate && day.iso <= event.endDate)) ? [index] : []);
      return columns.length ? [{ event, columns }] : [];
    }).sort((a, b) => Number(continuing.has(b.event.id)) - Number(continuing.has(a.event.id)) ||
      a.columns[0] - b.columns[0] || b.columns.at(-1)! - a.columns.at(-1)! ||
      (a.event.setupDate || a.event.startDate).localeCompare(b.event.setupDate || b.event.startDate) || a.event.id - b.event.id);
    const occupied: { start: number; end: number }[][] = [];
    const entries = candidates.map(({ event, columns }): CalendarEntry => {
      const start = columns[0], end = columns.at(-1)!;
      const available = (lane: number) => !(occupied[lane] ?? []).some(span => span.start <= end && span.end >= start);
      const preferred = continuing.get(event.id);
      let lane = preferred !== undefined && available(preferred) ? preferred : 0;
      while (!available(lane)) lane++;
      (occupied[lane] ??= []).push({ start, end });
      return { event, columns, lane };
    });
    continuing = new Map(entries.filter(entry => entry.columns.includes(6)).map(entry => [entry.event.id, entry.lane]));
    weeks.push({ days: weekDays, entries, laneCount: occupied.length });
  }
  return weeks;
}
