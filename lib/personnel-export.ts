import { eventDates, operatorWorksOn, roles, type EventRecord, type Role } from "./agenda.ts";
import { canonicalOperatorName, normalizeSearchText } from "./event-insights.ts";

export const personnelHeaders = ["OS", "LUGAR", "SALA", "MES", "FECHA", "ARMADO", "EVENTO", "DESARME", "PERSONAL", "PUESTO", "JORNADAS"];
const positionLabels: Record<Role, string> = { director: "DIRECCION", cameras: "CAMARA", volante: "VOLANTE", vmix: "VMIX" };
const months = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
export type PersonnelRow = { id: string; order: string; location: string; room: string; month: string; monthKey: string; dates: string[]; dateLabel: string; setup: boolean; event: boolean; dismantle: boolean; person: string; position: string; days: number | null };

export function personnelDateLabel(dates: string[]): string {
  const days = [...new Set(dates.map(date => Number(date.slice(8, 10))))].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const day of days) {
    const last = groups[groups.length - 1];
    if (last && last[last.length - 1] === day - 1) last.push(day); else groups.push([day]);
  }
  const labels = groups.map(group => group.length > 2 ? `${group[0]} AL ${group[group.length - 1]}` : group.join(" Y "));
  return labels.length < 2 ? labels[0] ?? "" : `${labels.slice(0, -1).join(", ")} Y ${labels[labels.length - 1]}`;
}

export function personnelRows(event: EventRecord, dismantleOnLastDay = true): PersonnelRow[] {
  const allDates = eventDates(event);
  return event.assignments.flatMap(room => {
    const people = new Map<string, { name: string; days: Map<string, Set<Role>> }>();
    for (const role of roles) for (const person of room.crew[role]) {
      const name = canonicalOperatorName(person.name), key = normalizeSearchText(name);
      if (!key) continue;
      for (const date of allDates.filter(date => operatorWorksOn(person, date))) {
        const entry = people.get(key) ?? { name, days: new Map<string, Set<Role>>() };
        const positions = entry.days.get(date) ?? new Set<Role>(); positions.add(role);
        entry.days.set(date, positions); people.set(key, entry);
      }
    }
    const groups = new Map<string, { name: string; position: string; dates: string[] }>();
    for (const [key, person] of people) for (const [date, positions] of person.days) {
      const position = roles.filter(role => positions.has(role)).map(role => positionLabels[role]).join(" / ");
      const groupKey = `${key}:${date.slice(0, 7)}:${position}`;
      const group = groups.get(groupKey) ?? { name: person.name, position, dates: [] };
      group.dates.push(date); groups.set(groupKey, group);
    }
    if (!groups.size) for (const date of allDates) {
      const key = `unassigned:${date.slice(0, 7)}`;
      const group = groups.get(key) ?? { name: "", position: "", dates: [] };
      group.dates.push(date); groups.set(key, group);
    }
    return [...groups].map(([key, group]): PersonnelRow => {
      const dates = [...new Set(group.dates)].sort();
      const monthKey = dates[0].slice(0, 7);
      return { id: `${room.id}:${key}`, order: event.orderNumber, location: event.location.toLocaleUpperCase("es-AR"), room: room.salon.toLocaleUpperCase("es-AR"), month: months[Number(monthKey.slice(5)) - 1], monthKey,
        dates, dateLabel: personnelDateLabel(dates), setup: dates.includes(event.setupDate), event: dates.some(date => date >= event.startDate && date <= event.endDate), dismantle: dismantleOnLastDay && !!group.name && dates.includes(event.endDate),
        person: group.name.toLocaleUpperCase("es-AR"), position: group.position, days: group.name ? dates.length : null };
    });
  }).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function personnelFilename(event: EventRecord): string {
  const safe = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70);
  return `personal-${safe(event.orderNumber) || "sin-orden"}-${safe(event.eventName) || "evento"}.xlsx`;
}

export async function personnelWorkbook(event: EventRecord, rows: PersonnelRow[]): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Congress Rental - CCTV";
  const sheet = workbook.addWorksheet("Personal", { views: [{ state: "frozen", ySplit: 3 }], pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3" } });
  sheet.columns = [11, 25, 30, 18, 22, 11, 11, 12, 32, 24, 12].map(width => ({ width }));
  const periods = [...new Set(rows.map(row => `${row.month} ${row.monthKey.slice(0, 4)}`))];
  sheet.mergeCells("A1:K1"); sheet.getCell("A1").value = periods.join(" / ");
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
  sheet.getCell("A1").font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle", wrapText: true }; sheet.getRow(1).height = 28;
  sheet.mergeCells("A2:K2"); sheet.getCell("A2").value = event.eventName.toLocaleUpperCase("es-AR");
  sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF79646" } };
  sheet.getCell("A2").font = { name: "Arial", size: 12, bold: true, color: { argb: "FF000000" } };
  sheet.getCell("A2").alignment = { vertical: "middle", wrapText: true }; sheet.getRow(2).height = 28;
  const header = sheet.addRow(personnelHeaders); header.height = 25;
  header.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  for (const item of rows) {
    const row = sheet.addRow([item.order, item.location, item.room, item.month, item.dateLabel, item.setup ? "☑" : "☐", item.event ? "☑" : "☐", item.dismantle ? "☑" : "☐", item.person, item.position, item.days]);
    row.height = 32;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF000000" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    row.getCell(1).numFmt = "@";
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
    row.getCell(1).font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    row.getCell(11).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    row.getCell(11).numFmt = "0";
    for (const column of [6, 7, 8]) {
      row.getCell(column).font = { name: "Segoe UI Symbol", size: 13, color: { argb: "FF000000" } };
      row.getCell(column).dataValidation = { type: "list", allowBlank: false, formulae: ['"☐,☑"'], showErrorMessage: true, errorTitle: "Marca inválida", error: "Seleccioná una de las dos marcas." };
    }
  }
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, rows.length + 3), column: 11 } };
  sheet.pageSetup.printArea = `A1:K${Math.max(3, rows.length + 3)}`;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
