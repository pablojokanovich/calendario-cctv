import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { newDraft, normalizeAssignment, normalizeEvent } from "../lib/agenda.ts";
import { personnelDateLabel, personnelFilename, personnelRows, personnelWorkbook, personnelHeaders } from "../lib/personnel-export.ts";

function fixture() {
  const event = normalizeEvent({ ...newDraft(), id: 7, orderNumber: "0012", eventName: "Congreso", location: "CEC", setupDate: "2026-08-31", startDate: "2026-09-01", endDate: "2026-09-03" });
  event.assignments[0].salon = "Sala A";
  event.assignments[0].crew.cameras = [{ id: "a", name: "Cami", confirmed: true, dates: ["2026-08-31", "2026-09-02"] }, { id: "b", name: "Lucas", confirmed: false, dates: ["2026-09-01", "2026-09-03"] }];
  event.assignments[0].crew.director = [{ id: "c", name: "Camila Diamela", confirmed: false, dates: ["2026-09-02"] }];
  return event;
}

test("personnel rows preserve per-day replacements and split months without duplicating same-person roles", () => {
  const event = fixture(), before = structuredClone(event);
  const rows = personnelRows(event);
  const camila = rows.filter(row => row.person === "CAMILA DIAMELA");
  assert.equal(camila.length, 2);
  assert.equal(camila[0].month, "AGOSTO"); assert.equal(camila[0].dateLabel, "31");
  assert.equal(camila[0].setup, true); assert.equal(camila[0].event, false);
  assert.equal(camila[1].month, "SEPTIEMBRE"); assert.equal(camila[1].position, "DIRECCION / CAMARA");
  assert.equal(camila[1].days, 1);
  const lucas = rows.find(row => row.person === "LUCAS ANDREU");
  assert.equal(lucas.dateLabel, "1 Y 3"); assert.equal(lucas.days, 2);
  assert.equal(lucas.dismantle, true);
  assert(camila.every(row => row.dismantle === false));
  assert(personnelRows(event, false).every(row => row.dismantle === false));
  assert.deepEqual(event, before);
});

test("empty rooms get editable blank personnel rows without inventing operators or jornadas", () => {
  const event = fixture(); event.assignments = [normalizeAssignment({ salon: "Sin personal" })];
  const rows = personnelRows(event);
  assert.equal(rows.length, 2);
  assert(rows.every(row => row.person === "" && row.position === "" && row.days === null));
  assert(rows.every(row => row.dismantle === false));
  assert.equal(rows[1].dateLabel, "1 AL 3");
  assert.equal(personnelDateLabel(["2026-09-06", "2026-09-05", "2026-09-05"]), "5 Y 6");
  assert.equal(personnelDateLabel(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05"]), "1 AL 3 Y 5");
});

test("all last-day operators dismantle regardless of role, room or confirmation", () => {
  const event = fixture();
  event.assignments.push(normalizeAssignment({ salon: "Sala B", crew: {
    director: [{ name: "Maca", confirmed: false }],
    vmix: [{ name: "Fiore", confirmed: true, dates: [event.endDate] }],
    volante: [{ name: "Lean", confirmed: false, dates: [event.endDate] }],
  } }));
  const rows = personnelRows(event);
  for (const row of rows) assert.equal(row.dismantle, row.dates.includes(event.endDate));
  const fileRows = rows.filter(row => row.dismantle);
  assert.equal(fileRows.length, 4);
  assert.equal(new Set(fileRows.map(row => row.position)).size, 4);
});

test("internal staff are included in the operational export and roles changing by day remain separate", () => {
  const event = fixture();
  event.assignments[0].crew.director = [{ id: "a", name: "Pablo", confirmed: true, dates: ["2026-09-01"] }];
  event.assignments[0].crew.cameras = [{ id: "b", name: "Pablo Jokanovich", confirmed: false, dates: ["2026-09-02"] }];
  const rows = personnelRows(event);
  assert.deepEqual(rows.map(row => [row.person, row.position, row.days]), [["PABLO JOKANOVICH", "DIRECCION", 1], ["PABLO JOKANOVICH", "CAMARA", 1]]);
});

test("xlsx export reopens with correct headers, leading-zero orders, numeric days, colors and editable ticks", async () => {
  const event = fixture(), rows = personnelRows(event);
  const file = await personnelWorkbook(event, rows);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file);
  const sheet = workbook.getWorksheet("Personal");
  assert.deepEqual(sheet.getRow(3).values.slice(1), personnelHeaders);
  assert.equal(sheet.getCell("A4").value, "0012"); assert.equal(sheet.getCell("A4").numFmt, "@");
  assert.equal(sheet.getCell("K4").type, ExcelJS.ValueType.Number);
  assert.equal(sheet.getCell("A3").fill.fgColor.argb, "FFFF0000");
  assert.equal(sheet.getCell("K4").fill.fgColor.argb, "FFFFFF00");
  assert.equal(sheet.getCell("F4").value, "☑"); assert.equal(sheet.getCell("H4").value, "☐");
  rows.forEach((row, index) => assert.equal(sheet.getCell(`H${index + 4}`).value, row.dates.includes(event.endDate) ? "☑" : "☐"));
  assert.equal(sheet.getCell("H4").dataValidation.type, "list");
  assert.equal(sheet.views[0].ySplit, 3); assert(sheet.autoFilter);
  assert.equal(sheet.rowCount, rows.length + 3);
  assert.match(personnelFilename({ ...event, eventName: "../Congreso: prueba" }), /^personal-0012-Congreso-prueba\.xlsx$/);
});
