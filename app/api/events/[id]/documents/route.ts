import { getDb } from "../../../../../db";
import { eventDocuments } from "../../../../../db/schema";
import { documentInfo, existingEventId, listDocuments } from "../../../../../db/documents";
import { documentChunkBytes, maxServiceOrderBytes } from "../../../../../lib/service-order";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const id = await existingEventId(context);
    if (!id) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    return Response.json({ documents: await listDocuments(id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to list event documents", error);
    return Response.json({ error: "No se pudieron cargar los documentos." }, { status: 500 });
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const data = await request.json() as { name?: unknown; size?: unknown };
    const name = typeof data.name === "string" ? data.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200) : "";
    const size = Number(data.size);
    if (!name.toLowerCase().endsWith(".pdf") || !Number.isSafeInteger(size) || size < 8 || size > maxServiceOrderBytes) {
      return Response.json({ error: "Seleccioná un PDF de hasta 10 MB." }, { status: 400 });
    }
    const id = await existingEventId(context);
    if (!id) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    await listDocuments(id);
    const created = new Date();
    // Unfinished uploads expire after one day; completed files get their full 30-day retention.
    const record = { id: crypto.randomUUID(), eventId: id, name, size, uploadedAt: created.toISOString(), expiresAt: new Date(created.getTime() + 86400000).toISOString(), complete: false };
    await getDb().insert(eventDocuments).values(record);
    return Response.json({ document: documentInfo(record), chunkBytes: documentChunkBytes }, { status: 201 });
  } catch (error) {
    console.error("Unable to start document upload", error);
    return Response.json({ error: "No se pudo iniciar la carga del PDF." }, { status: 500 });
  }
}
