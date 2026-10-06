import { normalizeHolidays } from "../../../lib/holidays";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("year") || "";
  const year = Number(value);
  if (!/^\d{4}$/.test(value) || year < 2016 || year > 2100) {
    return Response.json({ error: "Año de feriados inválido." }, { status: 400 });
  }
  try {
    const response = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`, {
      next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Holiday provider unavailable");
    const holidays = normalizeHolidays(await response.json(), year);
    if (!holidays.length) throw new Error("No holiday data for this year");
    return Response.json({ holidays });
  } catch {
    return Response.json({ error: `Feriados: datos no disponibles para ${year}.` }, { status: 502 });
  }
}
