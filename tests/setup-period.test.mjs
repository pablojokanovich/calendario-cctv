import assert from "node:assert/strict";
import test from "node:test";
import { eventDates, eventCrewText, eventOccursOn, isSetupDay, normalizeEvent, operatorDates } from "../lib/agenda.ts";
import { personnelRows } from "../lib/personnel-export.ts";

function fixture(setupDate = "2026-11-18", startDate = "2026-11-20", endDate = "2026-11-21") {
  return normalizeEvent({ setupDate, startDate, endDate, assignments: [{ salon: "A", crew: { cameras: [{ name: "Lucas", confirmed: true }] } }] });
}

test("two days before the start means two setup days, shared by default personnel and summaries", () => {
  const event = fixture();
  assert.deepEqual(eventDates(event), ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
  assert(isSetupDay(event, "2026-11-18"));
  assert(isSetupDay(event, "2026-11-19"));
  assert(!isSetupDay(event, "2026-11-20"));
  assert(eventOccursOn(event, "2026-11-19"));
  assert(!eventOccursOn(event, "2026-11-17"));
  assert.deepEqual(operatorDates(event, event.assignments[0].crew.cameras[0]), eventDates(event));
  assert(eventCrewText(event).includes("Armado: 18/11/2026 al 19/11/2026"));
});

test("setup crosses year and leap-month boundaries without missing or duplicating days", () => {
  assert.deepEqual(eventDates(fixture("2026-12-30", "2027-01-01", "2027-01-01")), ["2026-12-30", "2026-12-31", "2027-01-01"]);
  assert.deepEqual(eventDates(fixture("2028-02-28", "2028-03-01", "2028-03-01")), ["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.deepEqual(eventDates(fixture("", "2026-11-20", "2026-11-21")), ["2026-11-20", "2026-11-21"]);
  assert.deepEqual(eventDates(fixture("2026-11-20", "2026-11-20", "2026-11-20")), ["2026-11-20"]);
});

test("personnel working only the second setup day export as setup, respecting room exceptions", () => {
  const event = fixture(), room = event.assignments[0], person = room.crew.cameras[0];
  person.dates = ["2026-11-19"];
  const [row] = personnelRows(event);
  assert.equal(row.setup, true);
  assert.equal(row.event, false);
  assert.equal(row.dismantle, false);
  assert.equal(row.days, 1);
  room.dates = ["2026-11-18", "2026-11-20", "2026-11-21"];
  assert.deepEqual(operatorDates(event, person, room), []);
});
