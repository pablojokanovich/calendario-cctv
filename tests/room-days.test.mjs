import assert from "node:assert/strict";
import test from "node:test";
import { newDraft, normalizeEvent, normalizeAssignment, assignmentDates, operatorDates, operatorWorksOn, crewSummary, toPayload, eventCrewText } from "../lib/agenda.ts";
import { findCrewConflicts } from "../lib/event-insights.ts";
import { operatorAgenda } from "../lib/operator-agenda.ts";
import { personnelRows } from "../lib/personnel-export.ts";
import { buildStatistics } from "../lib/statistics.ts";
import { calendarWeeks } from "../lib/calendar-layout.ts";

function fixture() {
  return normalizeEvent({ ...newDraft(), id: 7, orderNumber: "0012", eventName: "Prueba salas", location: "CEC", setupDate: "2026-11-01", startDate: "2026-11-03", endDate: "2026-11-04", assignments: [
    normalizeAssignment({ id: "a", salon: "A", serviceType: "CCTV A 2 HD", crew: { cameras: [{ name: "Lucas", confirmed: true }] } }),
    normalizeAssignment({ id: "b", salon: "B", serviceType: "1 PTZ", crew: { vmix: [{ name: "Cami", confirmed: false }] } }),
  ] });
}

test("legacy and new rooms default to all days; explicit dates survive persistence without erasing operators", () => {
  const event = fixture(), room = event.assignments[0];
  assert.equal(room.dates, undefined);
  assert.deepEqual(assignmentDates(event, room), ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
  room.dates = ["2026-11-04", "2026-11-01", "2026-11-01", "bad"];
  const stored = toPayload(event);
  const restored = normalizeEvent({ ...stored, assignments: JSON.parse(stored.assignments) });
  assert.deepEqual(restored.assignments[0].dates, ["2026-11-01", "2026-11-04"]);
  assert.equal(restored.assignments[0].crew.cameras[0].name, "Lucas");
  room.dates = [];
  assert.deepEqual(operatorDates(event, room.crew.cameras[0], room), []);
  assert.equal(room.crew.cameras.length, 1);
  room.dates = undefined;
  assert.equal(operatorDates(event, room.crew.cameras[0], room).length, 4);
});

test("room days constrain agendas, services, confirmations, shared summaries and personnel jornadas", () => {
  const event = fixture(), room = event.assignments[0];
  room.dates = ["2026-11-01", "2026-11-04"];
  event.assignments[1].dates = [];
  const person = room.crew.cameras[0];
  assert.equal(operatorWorksOn(person, "2026-11-03", room), false);
  assert.deepEqual(operatorAgenda([event], "Lucas", "", "").map(day => day.date), room.dates);
  assert.deepEqual(operatorAgenda([event], "Cami", "", ""), []);
  assert.deepEqual(crewSummary(event), { total: 1, confirmed: 1, pending: 0 });
  const rows = personnelRows(event);
  assert.equal(rows.length, 1); assert.equal(rows[0].days, 2); assert.equal(rows[0].dismantle, true);
  const stats = buildStatistics([event], { from: "", to: "" });
  assert.deepEqual(stats.operators.map(person => [person.name, person.days]), [["Lucas Andreu", 2]]);
  assert.equal(stats.services.length, 1); assert.equal(stats.services[0].days, 2);
  const text = eventCrewText(event);
  assert(text.includes("Días: 01/11/2026, 04/11/2026")); assert(!text.includes("Cami"));
  person.dates = ["2026-11-01", "2026-11-03"];
  assert.deepEqual(operatorDates(event, person, room), ["2026-11-01"]);
  assert.equal(personnelRows(event)[0].days, 1);
});

test("disabled room days do not create conflicts or calendar entries, including fully disabled rooms", () => {
  const event = fixture(); event.assignments[0].dates = ["2026-11-04"]; event.assignments[1].dates = [];
  const other = fixture(); other.id = 8; other.setupDate = ""; other.startDate = other.endDate = "2026-11-03"; other.assignments = [other.assignments[0]];
  assert.equal(findCrewConflicts([event, other]).length, 0);
  other.startDate = other.endDate = "2026-11-04";
  assert.equal(findCrewConflicts([event, other]).length, 1);
  const days = Array.from({ length: 7 }, (_, i) => ({ date: new Date(2026, 10, i + 2), iso: `2026-11-${String(i + 2).padStart(2, "0")}`, inMonth: true }));
  assert.deepEqual(calendarWeeks(days, [event], "2026-11-01")[0].entries[0].columns, [2]);
  event.assignments[0].dates = [];
  assert.equal(calendarWeeks(days, [event], "2026-11-01")[0].entries.length, 0);
});
