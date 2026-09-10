import assert from "node:assert/strict";
import test from "node:test";
import { newDraft, normalizeEvent, normalizeAssignment, splitOperators, toPayload, validateEvent } from "../lib/agenda.ts";

test("legacy people remain separate and old confirmation applies only to cameras", () => {
  const room = normalizeAssignment({ salon: "LIBERTADOR ABC", director: "Maca", cameras: "Lucas, Esteban", vmix: "Pablo", wp: true });
  assert.deepEqual(room.crew.cameras.map(p => [p.name, p.confirmed]), [["Lucas", true], ["Esteban", true]]);
  assert.equal(room.crew.director[0].confirmed, false);
  assert.equal(room.crew.vmix[0].confirmed, false);
  assert.deepEqual(splitOperators("2 (Fiore, Guido o Noelia); Cami"), ["2 (Fiore, Guido o Noelia)", "Cami"]);
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
