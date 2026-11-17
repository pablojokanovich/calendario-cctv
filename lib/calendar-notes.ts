export const noteCategories = ["General", "Vacaciones", "Aviso", "Recordatorio", "Tarea a realizar"] as const;
export type NoteCategory = (typeof noteCategories)[number];
export function noteCategoryLabel(category: NoteCategory) {
  return category === "Tarea a realizar" ? "Tarea por realizar" : category;
}
export type CalendarNoteDraft = { title: string; start: string; end: string; category: NoteCategory };
export type CalendarNote = CalendarNoteDraft & { id: string };

export const pabloVacation: CalendarNote = {
  id: "pablo-vacaciones-2026", title: "Vacaciones Pablo",
  start: "2026-12-23", end: "2027-01-15", category: "Vacaciones",
};

export function noteCoversDay(note: CalendarNoteDraft, day: string) {
  return day >= note.start && day <= note.end;
}

export function parseCalendarNote(input: unknown): CalendarNoteDraft | null {
  if (!input || typeof input !== "object") return null;
  const { title, start, end, category } = input as Record<string, unknown>;
  const validDate = (value: unknown): value is string => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120 ||
      !validDate(start) || !validDate(end) || end < start ||
      !noteCategories.includes(category as NoteCategory)) return null;
  return { title: title.trim(), start, end, category: category as NoteCategory };
}
