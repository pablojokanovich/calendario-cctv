import assert from "node:assert/strict";
import test from "node:test";
import { eventCrewText, normalizeEvent } from "../lib/agenda.ts";

test("share text includes every room, role, dates and per-person confirmation without changing the event", () => {
  const event = normalizeEvent({
    orderNumber: "0029", eventName: " Congreso\nCCTV ", location: "CEC",
    setupDate: "2026-10-28", startDate: "2026-10-29", endDate: "2026-10-30",
    assignments: [
      { salon: "Sala A", serviceType: "2 PTZ", crew: { cameras: [{ name: "Lucas", confirmed: true }, { name: "Esteban", confirmed: false }, { name: "  ", confirmed: true }] } },
      { salon: "Sala B", crew: { director: [{ name: "Maca", confirmed: true }], vmix: [{ name: "Pablo", confirmed: false }] } },
    ],
  });
  const original = structuredClone(event);
  const text = eventCrewText(event);
  for (const expected of ["Congreso CCTV", "Orden: 0029", "Lugar: CEC", "Armado: 28/10/2026", "Evento: 29/10/2026 al 30/10/2026", "Sala A", "Sala B", "Servicio: 2 PTZ", "Lucas (confirmado)", "Esteban (por confirmar)", "Director: Maca (confirmado)", "vMix: Pablo (por confirmar)", "Volante: Sin asignar"]) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes(",  (confirmado)"));
  assert.deepEqual(event, original);
});

test("share text supports incomplete drafts and single-day events", () => {
  const event = normalizeEvent({ startDate: "2026-10-29", endDate: "2026-10-29" });
  const text = eventCrewText(event);
  assert.ok(text.includes("Evento: 29/10/2026\n"));
  assert.ok(text.includes("Armado: Sin definir"));
  assert.ok(text.includes("Sala 1 (sin nombre)"));
  assert.ok(!text.includes("undefined"));
});
