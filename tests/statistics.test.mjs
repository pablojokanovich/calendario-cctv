import assert from "node:assert/strict";
import test from "node:test";
import { newDraft, normalizeEvent, normalizeAssignment } from "../lib/agenda.ts";
import { buildStatistics } from "../lib/statistics.ts";

function event(id, location = "CEC") {
  const result = normalizeEvent({ ...newDraft(), id, location, setupDate: "2026-10-01", startDate: "2026-10-03", endDate: "2026-10-04" });
  result.assignments[0].serviceType = "CCTV A 2";
  result.assignments[0].crew.cameras = [{ id: "a", name: "Rodrigo", confirmed: false, dates: ["2026-10-01", "2026-10-03"] }, { id: "b", name: "Guido", confirmed: true, dates: ["2026-10-04"] }];
  return result;
}

test("statistics deduplicate operator events, rooms and working dates, respecting replacements", () => {
  const first = event(1);
  const secondRoom = normalizeAssignment({ salon: "B", serviceType: "cctv a 2", crew: { director: [{ name: " RODRIGO ", confirmed: true, dates: ["2026-10-03"] }] } });
  first.assignments.push(secondRoom);
  const result = buildStatistics([first, event(2)], { from: "", to: "" });
  assert.equal(result.eventCount, 2);
  assert.equal(result.eventDays, 6);
  assert.deepEqual(result.operators.map(p => [p.name, p.events, p.days]), [["Rodrigo", 2, 2], ["Guido Montini", 2, 1]]);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].events, 2);
  assert.equal(result.services[0].days, 6);
});

test("statistics clip actual work dates to the period, not gaps between setup and event", () => {
  const data = event(1);
  assert.equal(buildStatistics([data], { from: "2026-10-02", to: "2026-10-02" }).eventCount, 0);
  const result = buildStatistics([data], { from: "2026-10-04", to: "2026-10-04" });
  assert.equal(result.eventDays, 1);
  assert.deepEqual(result.operators.map(p => p.name), ["Guido Montini"]);
  assert.equal(buildStatistics([data], { from: "2027-01-01", to: "" }).eventCount, 0);
  assert.equal(buildStatistics([data], { from: "2026-11-01", to: "2026-10-01" }).invalidRange, true);
});

test("statistics group venue aliases and exclude empty or unassigned operator names", () => {
  const events = [event(1, "RURAL"), event(2, " la rural "), event(3, "GREENVILLE"), event(4, "SHERATON GREENVILLE")];
  events[0].assignments[0].crew.vmix = [{ id: "x", name: "Sin dias", dates: [], confirmed: true }, { id: "y", name: " ", confirmed: false }];
  const result = buildStatistics(events, { from: "", to: "" });
  assert.deepEqual(result.locations.map(row => [row.name, row.events]), [["RURAL", 2], ["SHERATON GREENVILLE", 2]]);
  assert.equal(result.operators.length, 2);
  assert.deepEqual(buildStatistics([], { from: "", to: "" }).services, []);
});

test("statistics normalize accents and spaces but do not combine different service configurations", () => {
  const a = event(1), b = event(2), c = event(3);
  a.assignments[0].crew.cameras = [{ id: "a", name: "Jerónimo", confirmed: true }];
  b.assignments[0].crew.cameras = [{ id: "b", name: " JERONIMO ", confirmed: false }];
  c.assignments[0].serviceType = "CCTV A 3 + VMIX";
  const result = buildStatistics([a, b, c], { from: "2026-10-01", to: "2026-10-04" });
  assert.equal(result.operators.find(p => p.key === "jeronimo").events, 2);
  assert.equal(result.services.length, 2);
});

test("statistics group the operator aliases explicitly confirmed by the user", () => {
  const a = event(1), b = event(2), c = event(3);
  a.assignments[0].crew.cameras = [{ id: "a", name: "Cami", confirmed: false }, { id: "b", name: "Lucas", confirmed: true }];
  b.assignments[0].crew.cameras = [{ id: "c", name: "Camila Diamela", confirmed: true }, { id: "d", name: "Lucas Andreu", confirmed: true }];
  c.assignments[0].crew.cameras = [{ id: "e", name: "Camila Garcia", confirmed: true }];
  const result = buildStatistics([a, b, c], { from: "", to: "" });
  assert.deepEqual(result.operators.map(p => [p.name, p.events]), [["Camila Diamela", 2], ["Lucas Andreu", 2], ["Camila Garcia", 1]]);
});

test("statistics exclude internal staff aliases only from operator totals, retaining freelancers and event totals", () => {
  const data = event(1);
  const people = ["Pablo", "Pablo J.", "Pablo Joka", "Pablo Jokanovich", "Lean", "Leandro", "Leandro Martinez", "Pablo Nami", "Esteban", "Esteban Santamarina", "Esteban Gomez"];
  data.assignments[0].crew.cameras = people.map((name, index) => ({ id: `person-${index}`, name, confirmed: true }));
  const before = structuredClone(data);
  const result = buildStatistics([data], { from: "", to: "" });
  assert.deepEqual(result.operators.map(p => p.name).sort(), ["Esteban Gomez", "Esteban Santamarina", "Pablo Daniel Nami"]);
  assert.equal(result.operators.find(p => p.name === "Esteban Santamarina").events, 1);
  assert.equal(result.eventCount, 1);
  assert.equal(result.eventDays, 3);
  assert.equal(result.locations[0].events, 1);
  assert.equal(result.services[0].events, 1);
  assert.deepEqual(data, before);
});
