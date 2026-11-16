const pabloVacation = { label: "Vacaciones Pablo", start: "2026-12-23", end: "2027-01-15" };

export function calendarNoteForDay(day: string): string | undefined {
  return day >= pabloVacation.start && day <= pabloVacation.end ? pabloVacation.label : undefined;
}
