export type Holiday = { date: string; name: string; nonWorking: boolean };

export function normalizeHolidays(value: unknown, year: number): Holiday[] {
  if (!Array.isArray(value)) throw new Error("Invalid holiday response");
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const { fecha, nombre, tipo } = item as Record<string, unknown>;
    if (typeof fecha !== "string" || typeof nombre !== "string" || !nombre.trim()) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !fecha.startsWith(`${year}-`)) return [];
    const date = new Date(`${fecha}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== fecha) return [];
    if (!["inamovible", "trasladable", "puente", "no_laborable", "nolaborable"].includes(String(tipo))) return [];
    return [{ date: fecha, name: nombre.trim(), nonWorking: !["inamovible", "trasladable"].includes(String(tipo)) }];
  });
}
