import assert from "node:assert/strict";
import test from "node:test";
import { dateIso, newDraft, normalizeEvent } from "../lib/agenda.ts";
import { calendarWeeks } from "../lib/calendar-layout.ts";

function days(start, count) {
  const first = new Date(`${start}T12:00:00`);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    return { date, iso: dateIso(date), inMonth: date.getMonth() === first.getMonth() };
  });
}
function event(id, setupDate, startDate, endDate) {
  return normalizeEvent({ ...newDraft(), id, setupDate, startDate, endDate });
}

test("multi-day events keep one weekly lane, without overlaps, regardless of input order", () => {
  const events = [event(1, "", "2026-11-02", "2026-11-02"), event(2, "2026-11-02", "2026-11-03", "2026-11-05"), event(3, "", "2026-11-04", "2026-11-06")];
  const [week] = calendarWeeks(days("2026-11-02", 7), events, "2026-11-01");
  assert.deepEqual(week, calendarWeeks(days("2026-11-02", 7), [...events].reverse(), "2026-11-01")[0]);
  assert.deepEqual(week.entries.find(entry => entry.event.id === 2).columns, [0, 1, 2, 3]);
  for (let column = 0; column < 7; column++) {
    const lanes = week.entries.filter(entry => entry.columns.includes(column)).map(entry => entry.lane);
    assert.equal(lanes.length, new Set(lanes).size);
  }
  assert.equal(week.entries.find(entry => entry.event.id === 1).lane, week.entries.find(entry => entry.event.id === 3).lane);
});

test("week boundaries retain continuing lanes and setup gaps stay empty", () => {
  const events = [event(1, "2026-11-02", "2026-11-06", "2026-11-10"), event(2, "", "2026-11-03", "2026-11-05"), event(3, "", "2026-11-09", "2026-11-09")];
  const weeks = calendarWeeks(days("2026-11-02", 14), events, "2026-11-01");
  assert.deepEqual(weeks[0].entries.find(entry => entry.event.id === 1).columns, [0, 4, 5, 6]);
  assert.equal(weeks[0].entries.find(entry => entry.event.id === 1).lane, weeks[1].entries.find(entry => entry.event.id === 1).lane);
  assert.equal(weeks[1].entries.find(entry => entry.event.id === 3).lane, 1);
});

test("previous-month events stay hidden, next-month trailing days and empty weeks remain", () => {
  const events = [event(1, "", "2026-10-26", "2026-11-02")];
  const weeks = calendarWeeks(days("2026-10-26", 14), events, "2026-11-01");
  assert.deepEqual(weeks[0].entries[0].columns, [6]);
  assert.deepEqual(weeks[1].entries[0].columns, [0]);
  assert.equal(calendarWeeks(days("2026-11-02", 7), [], "2026-11-01")[0].laneCount, 0);
  assert.deepEqual(calendarWeeks([], events, "2026-11-01"), []);
});
