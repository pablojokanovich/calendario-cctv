import assert from "node:assert/strict";
import test from "node:test";
import { noteCoversDay, pabloVacation, parseCalendarNote } from "../lib/calendar-notes.ts";

test("Pablo's vacation includes both endpoints and crosses into the new year", () => {
  for (const day of ["2026-12-23", "2026-12-25", "2027-01-01", "2027-01-15"]) {
    assert.equal(noteCoversDay(pabloVacation, day), true);
  }
  for (const day of ["2026-12-22", "2027-01-16", "2027-12-23"]) {
    assert.equal(noteCoversDay(pabloVacation, day), false);
  }
});

test("note validation handles one-day notes, invalid ranges and categories", () => {
  const note = { title: " Aviso ", start: "2027-01-15", end: "2027-01-15", category: "Aviso" };
  assert.deepEqual(parseCalendarNote(note), { ...note, title: "Aviso" });
  assert.equal(parseCalendarNote({ ...note, category: "Tarea a realizar" }).category, "Tarea a realizar");
  for (const patch of [{ title: " " }, { end: "2027-01-14" }, { end: "2027-02-30" }, { category: "Evento" }]) {
    assert.equal(parseCalendarNote({ ...note, ...patch }), null);
  }
});
