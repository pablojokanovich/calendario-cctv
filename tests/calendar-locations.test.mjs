import assert from "node:assert/strict";
import test from "node:test";
import { calendarLocationColor } from "../lib/event-insights.ts";

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
