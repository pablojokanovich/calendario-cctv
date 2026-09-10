import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { events } from "../../../../db/schema";
import { EventValidationError, normalizeEvent, toPayload } from "../../../../lib/agenda";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    const payload = toPayload(await request.json());
    const [event] = await getDb().update(events).set(payload).where(eq(events.id, Number(id))).returning();
    if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    return Response.json({ event: normalizeEvent({ ...event, assignments: JSON.parse(event.assignments) }) });
  } catch (error) {
    if (error instanceof EventValidationError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Unable to update event", error);
    return Response.json({ error: "No se pudo guardar online. Tus cambios siguen disponibles para reintentar." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    await getDb().delete(events).where(eq(events.id, Number(id)));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete event", error);
    return Response.json({ error: "No se pudo eliminar el evento. Intentá nuevamente." }, { status: 500 });
  }
}
