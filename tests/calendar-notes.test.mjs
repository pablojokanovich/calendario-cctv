import assert from "node:assert/strict";
import test from "node:test";
import { calendarNoteForDay } from "../lib/calendar-notes.ts";

test("Pablo's vacation includes both endpoints and crosses into the new year", () => {
  for (const day of ["2026-12-23", "2026-12-25", "2027-01-01", "2027-01-15"]) {
    assert.equal(calendarNoteForDay(day), "Vacaciones Pablo");
  }
  for (const day of ["2026-12-22", "2027-01-16", "2027-12-23"]) {
    assert.equal(calendarNoteForDay(day), undefined);
  }
});
