import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHolidays } from "../lib/holidays.ts";

test("holidays distinguish national holidays from non-working tourist days", () => {
  assert.deepEqual(normalizeHolidays([
    { fecha: "2026-10-12", nombre: "Diversidad Cultural", tipo: "trasladable" },
    { fecha: "2026-12-07", nombre: "Puente turístico no laborable", tipo: "puente" },
    { fecha: "2026-12-25", nombre: "Navidad", tipo: "inamovible" },
  ], 2026), [
    { date: "2026-10-12", name: "Diversidad Cultural", nonWorking: false },
    { date: "2026-12-07", name: "Puente turístico no laborable", nonWorking: true },
    { date: "2026-12-25", name: "Navidad", nonWorking: false },
  ]);
});

test("invalid dates, unsupported types and other years are not marked", () => {
  assert.deepEqual(normalizeHolidays([
    null, {}, { fecha: "2026-02-31", nombre: "Invalid", tipo: "inamovible" },
    { fecha: "2027-01-01", nombre: "Other year", tipo: "inamovible" },
    { fecha: "2026-01-01", nombre: "", tipo: "inamovible" },
    { fecha: "2026-01-01", nombre: "Regional", tipo: "local" },
  ], 2026), []);
  assert.throws(() => normalizeHolidays({}, 2026));
});
