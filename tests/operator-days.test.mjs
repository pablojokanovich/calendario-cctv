import assert from "node:assert/strict";
import test from "node:test";
import { crewSummary, eventCrewText, eventDates, normalizeEvent, operatorDates, operatorWorksOn, toPayload } from "../lib/agenda.ts";
import { findCrewConflicts } from "../lib/event-insights.ts";

function fixture(id = 1) {
  return normalizeEvent({ id, orderNumber: "0051", eventName: "Congreso", location: "CEC", setupDate: "2026-10-28", startDate: "2026-10-30", endDate: "2026-11-01", assignments: [{ id: "sala-a", salon: "Sala A", crew: { cameras: [{ id: "a", name: "Lucas", confirmed: true }] } }] });
}

test("general assignments include setup and all event days, without including gaps", () => {
  const event = fixture();
  const days = ["2026-10-28", "2026-10-30", "2026-10-31", "2026-11-01"];
  assert.deepEqual(eventDates(event), days);
  assert.deepEqual(operatorDates(event, event.assignments[0].crew.cameras[0]), days);
  assert.deepEqual(eventDates({ ...event, setupDate: event.startDate }), days.slice(1));
  assert.deepEqual(eventDates({ ...event, setupDate: "2026-11-03" }), [...days.slice(1), "2026-11-03"]);
  assert.deepEqual(eventDates({ ...event, setupDate: "", startDate: "2026-02-31" }), []);
});

test("daily replacements survive persistence, retain confirmation, and appear in shared text", () => {
  const event = fixture();
  const room = event.assignments[0];
  room.crew.cameras[0].dates = ["2026-10-28", "2026-10-30", "2026-11-01"];
  room.crew.cameras.push({ id: "replacement", name: "Esteban", confirmed: false, dates: ["2026-10-31"] });
  const stored = toPayload(event);
  const restored = normalizeEvent({ ...stored, assignments: JSON.parse(stored.assignments) });
  assert.deepEqual(restored.assignments[0].crew, room.crew);
  assert.equal(operatorWorksOn(room.crew.cameras[0], "2026-10-31"), false);
  assert.equal(operatorWorksOn(room.crew.cameras[1], "2026-10-31"), true);
  assert.deepEqual(crewSummary(event), { total: 2, confirmed: 1, pending: 1 });
  assert.ok(eventCrewText(event).includes("Esteban [31/10/2026]"));
  room.crew.cameras[1].dates = [];
  assert.deepEqual(operatorDates(event, room.crew.cameras[1]), []);
  assert.deepEqual(crewSummary(event), { total: 1, confirmed: 1, pending: 0 });
  assert.ok(!eventCrewText(event).includes("Esteban"));
  assert.ok(!eventCrewText(event).includes("Sin días asignados"));
});

test("custom assignments do not silently expand when event dates change; general assignments do", () => {
  const event = fixture();
  const person = event.assignments[0].crew.cameras[0];
  person.dates = ["2026-10-30"];
  event.endDate = "2026-11-02";
  assert.deepEqual(operatorDates(event, person), ["2026-10-30"]);
  delete person.dates;
  assert.ok(operatorDates(event, person).includes("2026-11-02"));
  event.startDate = "2026-11-01";
  person.dates = ["2026-10-30"];
  assert.deepEqual(operatorDates(event, person), []);
});

test("normalization removes duplicate or invalid day values but preserves explicit no-days", () => {
  const event = fixture();
  event.assignments[0].crew.cameras[0].dates = ["2026-02-31", "2026-10-30", "2026-10-30", null, "bad", "2026-10-28"];
  const restored = normalizeEvent(event);
  assert.deepEqual(restored.assignments[0].crew.cameras[0].dates, ["2026-10-28", "2026-10-30"]);
  event.assignments[0].crew.cameras[0].dates = [];
  assert.deepEqual(normalizeEvent(event).assignments[0].crew.cameras[0].dates, []);
});

test("conflicts only include actual working days, merging same-room roles without losing dates", () => {
  const a = fixture();
  const b = fixture(2);
  a.assignments[0].crew.cameras[0].dates = ["2026-10-30", "2026-11-01"];
  b.assignments[0].crew.cameras[0].dates = ["2026-10-31"];
  assert.deepEqual(findCrewConflicts([a, b]), []);
  a.assignments[0].crew.director = [{ id: "d", name: "LUCAS", confirmed: false, dates: ["2026-10-31"] }];
  const conflicts = findCrewConflicts([a, b]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].periods, [{ start: "2026-10-31", end: "2026-10-31" }]);
  assert.deepEqual(findCrewConflicts([a]), []);
  b.assignments[0].crew.cameras[0].dates = ["2026-10-29"];
  assert.deepEqual(findCrewConflicts([a, b]), [], "Gap days are not bookings");
  b.assignments[0].crew.cameras[0].dates = [];
  assert.deepEqual(findCrewConflicts([a, b]), []);
  delete b.assignments[0].crew.cameras[0].dates;
  assert.deepEqual(findCrewConflicts([a, b])[0].periods, [{ start: "2026-10-30", end: "2026-11-01" }]);
});
