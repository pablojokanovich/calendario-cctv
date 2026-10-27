import assert from "node:assert/strict";
import test from "node:test";
import { emptyWorkspace, remainingEquipment, validateWorkspace } from "../lib/event-workspace.ts";
import { documentExpiry } from "../lib/service-order.ts";

test("equipment quantities cannot be overallocated across packages", () => {
  assert.equal(validateWorkspace(emptyWorkspace()), true);
  const state = { equipment: [{ id: "camera", roomId: "a", roomName: "Sala A", name: "Sony Z150", area: "CCTV", category: "Camaras", qty: 3 }], packages: [{ id: "b1", name: "Bulto 1", items: [{ equipmentId: "camera", qty: 2 }] }] };
  assert.equal(remainingEquipment(state, "camera"), 1);
  assert.equal(validateWorkspace(state), true);
  state.packages.push({ id: "b2", name: "Bulto 2", items: [{ equipmentId: "camera", qty: 2 }] });
  assert.equal(validateWorkspace(state), false);
  state.packages[1].items[0].qty = 1;
  assert.equal(validateWorkspace(state), true);
  state.equipment[0].qty = 0;
  assert.equal(validateWorkspace(state), false);
});

test("invalid, duplicate and dangling package references are rejected", () => {
  assert.equal(validateWorkspace(null), false);
  assert.equal(validateWorkspace({ equipment: [], packages: [{ id: "b", name: "B", items: [{ equipmentId: "missing", qty: 1 }] }] }), false);
  const state = { equipment: [{ id: "camera", roomId: "a", roomName: "A", name: "Sony", area: "CCTV", category: "Camara", qty: 3 }], packages: [] };
  state.equipment.push({ ...state.equipment[0] });
  assert.equal(validateWorkspace(state), false);
});

test("PDF expiry is exactly 30 days and crosses month/year boundaries", () => {
  assert.equal(documentExpiry(new Date("2026-12-20T10:00:00.000Z")), "2027-01-19T10:00:00.000Z");
});
