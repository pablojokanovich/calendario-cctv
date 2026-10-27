import assert from "node:assert/strict";
import test from "node:test";
import { newDraft, normalizeEvent, normalizeAssignment } from "../lib/agenda.ts";
import { agendaOperators, operatorAgenda, operatorAgendaText } from "../lib/operator-agenda.ts";

function fixture() {
  const event = normalizeEvent({ ...newDraft(), id: 7, orderNumber: "0012", eventName: "Congreso", location: "CEC", setupDate: "2026-11-01", startDate: "2026-11-03", endDate: "2026-11-04" });
  event.assignments[0].salon = "A";
  event.assignments[0].crew.cameras = [{ id: "a", name: "Cami", confirmed: false, dates: ["2026-11-01", "2026-11-03"] }, { id: "b", name: "Lucas", confirmed: true, dates: ["2026-11-04"] }];
  event.assignments.push(normalizeAssignment({ salon: "B", crew: { director: [{ id: "c", name: "Camila Diamela", confirmed: true, dates: ["2026-11-03"] }] } }));
  return event;
}

test("individual agendas group aliases, include setup and actual assignments, and exclude replaced days", () => {
  const event = fixture();
  const bookings = operatorAgenda([event], "Camila Diamela", "2026-11-01", "2026-11-04");
  assert.deepEqual(bookings.map(b => b.date), ["2026-11-01", "2026-11-03"]);
  assert.equal(bookings[1].rooms.length, 2);
  assert.equal(operatorAgenda([event], "Lucas Andreu", "", "")[0].date, "2026-11-04");
  assert.deepEqual(operatorAgenda([event], "Cami", "2026-11-04", "2026-11-01"), []);
  const names = agendaOperators([event], ["Cami", "Lucas Andreu", "Pablo"]);
  assert.deepEqual(names, ["Camila Diamela", "Lucas Andreu", "Pablo Jokanovich"]);
  const text = operatorAgendaText("Cami", bookings);
  assert.match(text, /ARMADO/); assert.match(text, /A: Camarógrafos/); assert.match(text, /B: Director/);
  assert(!text.includes("Lucas")); assert(!text.includes("confirmado")); assert(!text.includes("vMix:"));
});

test("individual agenda text shows same-day setup and event and sorts across events", () => {
  const event = fixture(); event.setupDate = event.startDate;
  const earlier = { ...event, id: 2, setupDate: "2026-10-30", startDate: "2026-10-30", endDate: "2026-10-30" };
  earlier.assignments = [normalizeAssignment({ salon: "C", crew: { cameras: [{ name: "Cami", confirmed: true }] } })];
  const bookings = operatorAgenda([event, earlier], "Cami", "", "");
  assert.equal(bookings[0].eventId, 2);
  assert.match(operatorAgendaText("Cami", bookings), /ARMADO \+ EVENTO/);
});
