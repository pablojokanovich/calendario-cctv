import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { events, serviceOrders } from "../../../../../db/schema";
import { ensureServiceOrderTable } from "../../../../../db/service-orders";
import { maxServiceOrderBytes, validateServiceOrder } from "../../../../../lib/service-order";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

async function eventId(context: Context) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [event] = await getDb().select({ id: events.id }).from(events).where(eq(events.id, id));
  return event ? id : null;
}
function failure(error: unknown) {
  console.error("Service order request failed", error);
  return Response.json({ error: "No se pudo acceder a la orden de servicio. Intentá nuevamente." }, { status: 500 });
}

export async function GET(request: Request, context: Context) {
  try {
    const id = await eventId(context);
    if (!id) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    await ensureServiceOrderTable();
    const download = new URL(request.url).searchParams.has("download");
    if (!download) {
      const [document] = await getDb().select({ name: serviceOrders.name, size: serviceOrders.size, updatedAt: serviceOrders.updatedAt }).from(serviceOrders).where(eq(serviceOrders.eventId, id));
      return Response.json({ document: document || null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [document] = await getDb().select().from(serviceOrders).where(eq(serviceOrders.eventId, id));
    if (!document) return Response.json({ error: "No hay PDF adjunto." }, { status: 404 });
    return new Response(new Uint8Array(Buffer.from(document.content, "base64")), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="orden-de-servicio.pdf"; filename*=UTF-8''${encodeURIComponent(document.name)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request, context: Context) {
  try {
    if (Number(request.headers.get("content-length")) > maxServiceOrderBytes + 65536) return Response.json({ error: "El PDF no puede superar los 3 MB." }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Seleccioná un PDF." }, { status: 400 });
    if (file.size > maxServiceOrderBytes) return Response.json({ error: "El PDF no puede superar los 3 MB." }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const error = validateServiceOrder(file.name, bytes);
    if (error) return Response.json({ error }, { status: 400 });
    const id = await eventId(context);
    if (!id) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    await ensureServiceOrderTable();
    const document = { eventId: id, name: file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200), size: file.size, content: Buffer.from(bytes).toString("base64"), updatedAt: new Date().toISOString() };
    await getDb().insert(serviceOrders).values(document).onConflictDoUpdate({ target: serviceOrders.eventId, set: document });
    return Response.json({ document: { name: document.name, size: document.size, updatedAt: document.updatedAt } });
  } catch (error) { return failure(error); }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const id = await eventId(context);
    if (!id) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    await ensureServiceOrderTable();
    await getDb().delete(serviceOrders).where(eq(serviceOrders.eventId, id));
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
