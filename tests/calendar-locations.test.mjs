import assert from "node:assert/strict";
import test from "node:test";
import { calendarLocationColor, calendarLocationOptions, locationFilterKey } from "../lib/event-insights.ts";

test("calendar locations use their specific colors regardless of case and spacing", () => {
  const expected = { CEC: "#1d4ed8", "SHERATON RETIRO": "#c81e1e", "SHERATON GREENVILLE": "#00a82d", HILTON: "#c04b00", "BA FERIAL": "#087eac", RURAL: "#14532d" };
  for (const [location, color] of Object.entries(expected)) {
    assert.equal(calendarLocationColor(location), color);
    assert.equal(calendarLocationColor(`  ${location.toLowerCase().replaceAll(" ", "   ")}  `), color);
  }
});

test("other locations have no assigned background, including partial matches", () => {
  for (const location of ["", "Otra locación", "HILTON PILAR", "SHERATON", "CEC - SALA A", "constructor", "__proto__"]) assert.equal(calendarLocationColor(location), null);
});

test("Rural and La Rural share the same dark green badge", () => {
  for (const location of ["LA RURAL", "La Rural", "  la   rural  "]) {
    assert.equal(calendarLocationColor(location), calendarLocationColor("RURAL"));
    assert.equal(calendarLocationColor(location), "#14532d");
  }
});

test("Greenville and Sheraton Greenville share the same green badge", () => {
  for (const location of ["GREENVILLE", "Greenville", "  greenville  "]) {
    assert.equal(calendarLocationColor(location), calendarLocationColor("SHERATON GREENVILLE"));
    assert.equal(calendarLocationColor(location), "#00a82d");
  }
});

test("location options include all venues, with normalized aliases and no duplicates", () => {
  const events = ["CEC", " cec ", "La Rural", "RURAL", "Greenville", "SHERATON GREENVILLE", " Predio de José ", "predio de jose", "", "  "].map(location => ({ location }));
  const original = structuredClone(events);
  assert.deepEqual(calendarLocationOptions(events), [
    { value: "cec", label: "CEC" },
    { value: "predio de jose", label: "PREDIO DE JOSÉ" },
    { value: "rural", label: "RURAL" },
    { value: "sheraton greenville", label: "SHERATON GREENVILLE" },
  ]);
  assert.deepEqual(events, original);
  assert.equal(locationFilterKey(" LA   RURAL "), locationFilterKey("rural"));
  assert.equal(locationFilterKey("GREENVILLE"), locationFilterKey("Sheraton Greenville"));
  assert.notEqual(locationFilterKey("CEC"), locationFilterKey("CEC - SALA A"));
});
