import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { events, eventWorkspaces } from "../../../../../db/schema";
import { ensureWorkspaces } from "../../../../../db/workspaces";
import { emptyWorkspace, validateWorkspace } from "../../../../../lib/event-workspace";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function existingId(context: Context) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [event] = await getDb().select({ id: events.id }).from(events).where(eq(events.id, id));
  return event ? id : null;
}
export async function GET(_request: Request, context: Context) {
  try {
    const id = await existingId(context);
    if (!id) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    await ensureWorkspaces();
    const [row] = await getDb().select().from(eventWorkspaces).where(eq(eventWorkspaces.eventId, id));
    return Response.json({ workspace: row ? JSON.parse(row.state) : emptyWorkspace() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to load workspace", error);
    return Response.json({ error: "No se pudieron cargar los equipos y remitos." }, { status: 500 });
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1024 * 1024) return Response.json({ error: "La planilla supera el tamaño permitido." }, { status: 413 });
    const workspace: unknown = JSON.parse(raw);
    if (!validateWorkspace(workspace)) return Response.json({ error: "Revisá los equipos, cantidades y bultos." }, { status: 400 });
    const id = await existingId(context);
    if (!id) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    await ensureWorkspaces();
    const row = { eventId: id, state: JSON.stringify(workspace), updatedAt: new Date().toISOString() };
    await getDb().insert(eventWorkspaces).values(row).onConflictDoUpdate({ target: eventWorkspaces.eventId, set: row });
    return Response.json({ workspace });
  } catch (error) {
    console.error("Unable to save workspace", error);
    return Response.json({ error: "No se pudieron guardar los equipos y remitos." }, { status: 500 });
  }
}
