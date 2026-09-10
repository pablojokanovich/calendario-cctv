import assert from "node:assert/strict";
import test from "node:test";
import { newDraft, newOperator } from "../lib/agenda.ts";

const base = process.env.AGENDA_TEST_URL;
test("shared API persists rooms and independent confirmations", { skip: !base }, async () => {
  const draft = { ...newDraft(), orderNumber: "QA-" + Date.now(), eventName: "PRUEBA TEMPORAL DE GUARDADO", location: "PRUEBA" };
  draft.assignments[0].salon = "Libertador ABC";
  draft.assignments[0].crew.cameras = [{ ...newOperator(), name: "Camara uno", confirmed: true }, { ...newOperator(), name: "Camara dos", confirmed: false }];
  draft.assignments[0].crew.director = [{ ...newOperator(), name: "Director", confirmed: true }];
  draft.assignments[0].crew.vmix = [{ ...newOperator(), name: "Vmix", confirmed: false }];
  const headers = { "Content-Type": "application/json" };
  let id;
  try {
    const create = await fetch(new URL("/api/events", base), { method: "POST", headers, body: JSON.stringify(draft) });
    assert.equal(create.status, 201, await create.clone().text());
    id = (await create.json()).event.id;
    const revised = { ...draft, eventName: "PRUEBA TEMPORAL EDITADA" };
    revised.assignments[0].salon = "Sala completa editada en planilla";
    revised.assignments[0].crew.vmix[0].confirmed = true;
    const update = await fetch(new URL(`/api/events/${id}`, base), { method: "PUT", headers, body: JSON.stringify(revised) });
    assert.equal(update.status, 200, await update.clone().text());
    const invalid = await fetch(new URL(`/api/events/${id}`, base), { method: "PUT", headers, body: JSON.stringify({ ...revised, eventName: "" }) });
    assert.equal(invalid.status, 400);
    const loaded = await (await fetch(new URL("/api/events", base))).json();
    const event = loaded.events.find(item => item.id === id);
    assert.equal(event.eventName, revised.eventName);
    assert.equal(event.assignments[0].salon, revised.assignments[0].salon);
    assert.deepEqual(event.assignments[0].crew, revised.assignments[0].crew);
  } finally {
    if (id) {
      const result = await fetch(new URL(`/api/events/${id}`, base), { method: "DELETE" });
      assert.equal(result.status, 200, "Temporary test event must be removed");
    }
  }
});
