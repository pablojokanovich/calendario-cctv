import assert from "node:assert/strict";
import test from "node:test";
import { newDraft, normalizeEvent, normalizeAssignment } from "../lib/agenda.ts";
import { agendaOperators, groupOperatorAgenda, operatorAgenda, operatorAgendaText } from "../lib/operator-agenda.ts";

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
  assert.deepEqual(operatorAgenda([event], "Camila García", "2026-11-01", "2026-11-04"), bookings);
  assert.equal(operatorAgenda([event], "Lucas Andreu", "", "")[0].date, "2026-11-04");
  assert.deepEqual(operatorAgenda([event], "Cami", "2026-11-04", "2026-11-01"), []);
  const names = agendaOperators([event], ["Cami", "Camila Garcia", "Lucas Andreu", "Pablo"]);
  assert.deepEqual(names, ["Camila Diamela", "Lucas Andreu", "Pablo Jokanovich"]);
  const text = operatorAgendaText("Cami", bookings);
  assert.doesNotMatch(text, /ARMADO|EVENTO/); assert.match(text, /A: Camarógrafos/); assert.match(text, /B: Director/);
  assert.equal(text.match(/Congreso · Orden 0012/g).length, 1);
  assert.match(text, /01\/11\/2026\nA: Camarógrafos/);
  assert.match(text, /03\/11\/2026\nA: Camarógrafos\nB: Director/);
  assert.doesNotMatch(text, /02\/11\/2026|04\/11\/2026/);
  assert(!text.includes("Lucas")); assert(!text.includes("confirmado")); assert(!text.includes("vMix:"));
});

test("individual agendas group each event once without phases, retaining daily roles and chronological order", () => {
  const event = fixture(); event.setupDate = event.startDate;
  const earlier = { ...event, id: 2, setupDate: "2026-10-30", startDate: "2026-10-30", endDate: "2026-10-30" };
  earlier.assignments = [normalizeAssignment({ salon: "C", crew: { cameras: [{ name: "Cami", confirmed: true }] } })];
  const bookings = operatorAgenda([event, earlier], "Cami", "", "");
  assert.equal(bookings[0].eventId, 2);
  const grouped = groupOperatorAgenda([...bookings].reverse());
  assert.deepEqual(grouped.map(event => event.eventId), [2, 7]);
  assert.equal(grouped[1].days.length, 1);
  assert.equal(grouped[1].days[0].rooms.length, 2);
  const text = operatorAgendaText("Cami", bookings);
  assert.doesNotMatch(text, /ARMADO|EVENTO/);
  assert.equal(text.match(/03\/11\/2026/g).length, 1);
  assert.equal(text.match(/Congreso · Orden 0012/g).length, 2);
  assert.deepEqual(groupOperatorAgenda([]), []);
});
