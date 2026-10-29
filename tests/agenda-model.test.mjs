import assert from "node:assert/strict";
import test from "node:test";
import { crewSummary, eventCrewText, eventPlannerLink, newDraft, normalizeEvent, normalizeAssignment, splitOperators, toPayload, validateEvent } from "../lib/agenda.ts";

test("meals default to unchecked for legacy events and survive a database round trip", () => {
  const legacy = normalizeEvent({ orderNumber: "0001", eventName: "Prueba", location: "CEC", setupDate: "2026-11-01", startDate: "2026-11-03", endDate: "2026-11-04" });
  assert.deepEqual(legacy.mealDates, []); assert.equal(legacy.mealSheetLoaded, false);
  const draft = { ...legacy, mealDates: ["2026-11-04", "2026-11-01", "2026-11-01", "2026-11-02", "2026-11-05", "invalid"], mealSheetLoaded: true };
  const stored = toPayload(draft);
  assert.equal(stored.mealDates, '["2026-11-01","2026-11-04"]');
  const restored = normalizeEvent({ ...stored, assignments: JSON.parse(stored.assignments) });
  assert.deepEqual(restored.mealDates, ["2026-11-01", "2026-11-04"]);
  assert.equal(restored.mealSheetLoaded, true);
  assert.deepEqual(normalizeEvent({ ...draft, endDate: "2026-11-03" }).mealDates, ["2026-11-01"]);
  assert.deepEqual(normalizeEvent({ ...draft, mealDates: '{broken' }).mealDates, []);
  assert.equal(normalizeEvent({ ...draft, mealSheetLoaded: "true" }).mealSheetLoaded, false);
});

test("legacy people remain separate and old confirmation applies only to cameras", () => {
  const room = normalizeAssignment({ salon: "LIBERTADOR ABC", director: "Maca", cameras: "Lucas, Esteban", vmix: "Pablo", wp: true });
  assert.deepEqual(room.crew.cameras.map(p => [p.name, p.confirmed]), [["Lucas", true], ["Esteban", true]]);
  assert.equal(room.crew.director[0].confirmed, false);
  assert.equal(room.crew.vmix[0].confirmed, false);
  assert.deepEqual(splitOperators("2 (Fiore, Guido o Noelia); Cami"), ["2 (Fiore, Guido o Noelia)", "Cami"]);
});

test("locations default to uppercase when loading, saving and sharing without changing event names", () => {
  const draft = { ...newDraft(), orderNumber: "0029", eventName: "Congreso Médico", location: "Predio de José" };
  assert.equal(normalizeEvent(draft).location, "PREDIO DE JOSÉ");
  assert.equal(toPayload(draft).location, "PREDIO DE JOSÉ");
  assert.equal(toPayload(draft).eventName, "Congreso Médico");
  assert.ok(eventCrewText(draft).includes("Lugar: PREDIO DE JOSÉ"));
  const payload = JSON.parse(new URLSearchParams(new URL(eventPlannerLink(draft)).hash.slice(1)).get("agenda"));
  assert.equal(payload.ev.lugar, "PREDIO DE JOSÉ");
  assert.equal(draft.location, "Predio de José", "Formatting must not rewrite the active text input while typing");
});

test("individual confirmations and stable identities survive a database round trip", () => {
  const event = { ...newDraft(), id: 21, orderNumber: "0051", eventName: "Prueba", location: "CEC" };
  const room = event.assignments[0];
  room.crew.cameras = [{ id: "cam-1", name: "Lucas", confirmed: true }, { id: "cam-2", name: "Esteban", confirmed: false }];
  room.crew.director[0] = { id: "dir-1", name: "Maca", confirmed: true };
  room.crew.vmix[0] = { id: "vmix-1", name: "Pablo", confirmed: false };
  const stored = toPayload(event);
  const restored = normalizeEvent({ ...stored, id: 21, assignments: JSON.parse(stored.assignments) });
  assert.deepEqual(restored.assignments[0].crew, room.crew);
  assert.equal(restored.assignments[0].id, room.id);
  assert.equal(restored.orderNumber, "0051");
  assert.equal(restored.assignments[0].cameras, "Lucas, Esteban");
});

test("an event with no room remains editable and invalid dates are rejected", () => {
  const event = normalizeEvent({ ...newDraft(), orderNumber: "01", eventName: "Prueba", location: "CEC", assignments: [] });
  assert.equal(event.assignments.length, 1);
  assert.equal(validateEvent(event), null);
  assert.ok(validateEvent({ ...event, startDate: "2026-09-12", endDate: "2026-09-10" }));
  assert.ok(validateEvent({ ...event, startDate: "2026-02-31" }));
  assert.ok(validateEvent({ ...event, eventName: "   " }));
});

test("crew summary counts unique named operators and requires all their assignments to be confirmed", () => {
  const event = newDraft();
  assert.deepEqual(crewSummary(event), { total: 0, confirmed: 0, pending: 0 });
  event.assignments = [normalizeAssignment({ crew: { cameras: [
    { name: " Lucas ", confirmed: true }, { name: "Maca", confirmed: true }, { name: " ", confirmed: false },
  ] } }), normalizeAssignment({ crew: { director: [
    { name: "LUCAS", confirmed: false }, { name: "Pablo", confirmed: false },
  ] } })];
  assert.deepEqual(crewSummary(event), { total: 3, confirmed: 1, pending: 2 });
  event.assignments[1].crew.director[0].confirmed = true;
  assert.deepEqual(crewSummary(event), { total: 3, confirmed: 2, pending: 1 });
});
