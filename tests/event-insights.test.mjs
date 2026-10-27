import assert from "node:assert/strict";
import test from "node:test";
import { newDraft, normalizeEvent, normalizeAssignment } from "../lib/agenda.ts";
import { eventMatchesSearch, findCrewConflicts } from "../lib/event-insights.ts";
import { maxServiceOrderBytes, validateServiceOrder } from "../lib/service-order.ts";

function event(id, setupDate, startDate, endDate, name = "Lucas") {
  const result = normalizeEvent({ ...newDraft(), id, orderNumber: `00${id}`, eventName: "Congreso Médico", location: "CEC", setupDate, startDate, endDate });
  result.assignments[0].salon = "Libertador ABC";
  result.assignments[0].crew.cameras = [{ id: "cam", name, confirmed: false }];
  return result;
}

test("search matches all words across event fields, ignores accents and includes historical events", () => {
  const record = event(12, "2025-01-01", "2025-01-02", "2025-01-03", "Rodrigo Sorribes");
  assert.equal(eventMatchesSearch(record, "medico sorRibes libertador"), true);
  assert.equal(eventMatchesSearch(record, "CEC 0012"), true);
  assert.equal(eventMatchesSearch(record, "2025"), true);
  assert.equal(eventMatchesSearch(record, "Hilton"), false);
});

test("crosses include setup-only dates but exclude the gap before the event", () => {
  const a = event(1, "2026-11-01", "2026-11-05", "2026-11-06");
  assert.equal(findCrewConflicts([a, event(2, "", "2026-11-03", "2026-11-03")]).length, 0);
  const conflicts = findCrewConflicts([a, event(2, "2026-11-01", "2026-11-02", "2026-11-02", " LÚCAS ")]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].periods, [{ start: "2026-11-01", end: "2026-11-01" }]);
  assert.equal(findCrewConflicts([a, event(3, "", "2026-11-06", "2026-11-07")]).length, 1);
});

test("same-room double roles are not conflicts but two rooms are", () => {
  const a = event(1, "", "2026-11-05", "2026-11-06");
  a.assignments[0].crew.director = [{ id: "dir", name: "Lucas", confirmed: true }];
  assert.equal(findCrewConflicts([a]).length, 0);
  a.assignments.push(normalizeAssignment({ id: "room-2", salon: "Otra sala", cameras: "Lucas" }));
  assert.equal(findCrewConflicts([a]).length, 1);
  assert.equal(findCrewConflicts([a, event(2, "", "2026-11-07", "2026-11-08")]).length, 1);
});

test("PDF validation rejects renamed files, empty files and oversized orders", () => {
  const bytes = new TextEncoder().encode("%PDF-1.4\n%%EOF");
  assert.equal(validateServiceOrder("orden.PDF", bytes), null);
  assert.ok(validateServiceOrder("orden.jpg", bytes));
  assert.ok(validateServiceOrder("orden.pdf", new Uint8Array()));
  assert.ok(validateServiceOrder("orden.pdf", new TextEncoder().encode("not a PDF")));
  assert.ok(validateServiceOrder("orden.pdf", new Uint8Array(maxServiceOrderBytes + 1)));
});
