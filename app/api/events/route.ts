import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { events } from "../../../db/schema";
import { EventValidationError, normalizeEvent, toPayload } from "../../../lib/agenda";

export async function GET() {
  try {
    const rows = await getDb().select().from(events).orderBy(asc(events.startDate), asc(events.orderNumber));
    return Response.json({ events: rows.map(row => normalizeEvent({ ...row, assignments: JSON.parse(row.assignments) })) });
  } catch (error) {
    console.error("Unable to load events", error);
    return Response.json({ error: "No se pudo cargar la agenda compartida. Intentá nuevamente." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = toPayload(await request.json());
    const [event] = await getDb().insert(events).values(payload).returning();
    return Response.json({ event: normalizeEvent({ ...event, assignments: JSON.parse(event.assignments) }) }, { status: 201 });
  } catch (error) {
    if (error instanceof EventValidationError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Unable to create event", error);
    return Response.json({ error: "No se pudo guardar online. Tus cambios siguen disponibles para reintentar." }, { status: 500 });
  }
}
