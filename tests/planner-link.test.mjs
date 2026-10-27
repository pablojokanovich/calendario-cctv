import assert from "node:assert/strict";
import test from "node:test";
import { eventPlannerLink, normalizeEvent } from "../lib/agenda.ts";

test("planner link opens the original site with event data in a fragment, not a server query", () => {
  const event = normalizeEvent({ id: 4, orderNumber: "0029", eventName: "Congreso & TV", location: "CEC", setupDate: "2026-10-28", startDate: "2026-10-29", endDate: "2026-10-30", assignments: [
    { salon: "Sala A", director: "Maca", cameras: "Lucas" },
    { salon: "Sala B", director: "Maca" },
  ] });
  const original = structuredClone(event);
  const url = new URL(eventPlannerLink(event));
  assert.equal(url.origin, "https://planillascctv.vercel.app");
  assert.equal(url.pathname, "/");
  assert.equal(url.search, "");
  const payload = JSON.parse(new URLSearchParams(url.hash.slice(1)).get("agenda"));
  assert.equal(payload.source, "agenda-cctv");
  assert.equal(payload.eventKey, "agenda:4");
  assert.equal(payload.ev.os, "0029");
  assert.equal(payload.ev.evento, event.eventName);
  assert.equal(payload.ev.lugar, "CEC");
  assert.equal(payload.ev.armado, event.setupDate);
  assert.equal(payload.ev.desarme, event.endDate);
  assert.equal(payload.ev.lider, "Maca");
  assert.ok(payload.ev.notas.includes("Camarógrafos: Lucas"));
  assert.deepEqual(payload.salas, ["Sala A", "Sala B"]);
  assert.deepEqual(event, original);
});

test("new drafts can prefill the planner without being saved, retaining order zeros", () => {
  const event = normalizeEvent({ orderNumber: "0007", eventName: "Nuevo", startDate: "2026-10-29", endDate: "2026-10-29" });
  const payload = JSON.parse(new URLSearchParams(new URL(eventPlannerLink({ ...event, id: null })).hash.slice(1)).get("agenda"));
  assert.equal(payload.eventKey, "orden:0007");
  assert.equal(payload.ev.armado, "2026-10-29");
  assert.deepEqual(payload.salas, ["Sala 1"]);
});
