import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { documentChunks, eventDocuments } from "../../../../../../db/schema";
import { documentInfo, documentResponse, existingEventId, findDocument } from "../../../../../../db/documents";
import { documentChunkBytes, documentExpiry } from "../../../../../../lib/service-order";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; documentId: string }> };
async function getDocument(context: Context) {
  const id = await existingEventId(context);
  return id ? findDocument(id, (await context.params).documentId) : null;
}
export async function GET(_request: Request, context: Context) {
  try {
    const document = await getDocument(context);
    if (!document?.complete) return Response.json({ error: "El PDF no existe o ya venció." }, { status: 404 });
    return documentResponse(document);
  } catch (error) {
    console.error("Unable to download PDF", error);
    return Response.json({ error: "No se pudo abrir el PDF." }, { status: 500 });
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const document = await getDocument(context);
    if (!document) return Response.json({ error: "Carga inexistente o vencida." }, { status: 404 });
    if (document.complete) return Response.json({ error: "El PDF ya está guardado." }, { status: 409 });
    const part = Number(new URL(request.url).searchParams.get("part"));
    if (!new URL(request.url).searchParams.has("part") || !Number.isInteger(part) || part < 0 || part >= Math.ceil(document.size / documentChunkBytes)) return Response.json({ error: "Parte inválida." }, { status: 400 });
    if (Number(request.headers.get("content-length")) > documentChunkBytes) return Response.json({ error: "Parte demasiado grande." }, { status: 413 });
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length !== Math.min(documentChunkBytes, document.size - part * documentChunkBytes) || (part === 0 && bytes.subarray(0, 5).toString() !== "%PDF-")) {
      return Response.json({ error: "El PDF está incompleto o no es válido." }, { status: 400 });
    }
    const chunk = { documentId: document.id, part, content: bytes.toString("base64") };
    await getDb().insert(documentChunks).values(chunk).onConflictDoUpdate({ target: [documentChunks.documentId, documentChunks.part], set: { content: chunk.content } });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unable to upload PDF part", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "No se pudo cargar esta parte del PDF. Reintentá." }, { status: 500 });
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const body = await request.text();
    let restore: { uploadedAt?: unknown; expiresAt?: unknown } | undefined;
    try { restore = body ? (JSON.parse(body) as { restoreDates?: typeof restore }).restoreDates : undefined; }
    catch { return Response.json({ error: "Los datos de restauración no son válidos." }, { status: 400 }); }
    let restoredDates: { uploadedAt: string; expiresAt: string } | null = null;
    if (restore !== undefined) {
      const uploaded = typeof restore?.uploadedAt === "string" ? Date.parse(restore.uploadedAt) : NaN;
      const expiry = typeof restore?.expiresAt === "string" ? Date.parse(restore.expiresAt) : NaN;
      if (!Number.isFinite(uploaded) || !Number.isFinite(expiry) || uploaded > Date.now() || expiry <= Date.now() || expiry <= uploaded || expiry - uploaded > 30 * 86400000) return Response.json({ error: "El vencimiento original del PDF no es válido o ya pasó." }, { status: 400 });
      restoredDates = { uploadedAt: new Date(uploaded).toISOString(), expiresAt: new Date(expiry).toISOString() };
    }
    const document = await getDocument(context);
    if (!document) return Response.json({ error: "Carga inexistente o vencida." }, { status: 404 });
    if (document.complete) return Response.json({ document: documentInfo(document) });
    const chunks = await getDb().select({ part: documentChunks.part }).from(documentChunks).where(eq(documentChunks.documentId, document.id)).orderBy(asc(documentChunks.part));
    if (chunks.length !== Math.ceil(document.size / documentChunkBytes) || chunks.some((chunk, index) => chunk.part !== index)) return Response.json({ error: "Faltan partes del PDF. Volvé a cargarlo." }, { status: 400 });
    const uploadedAt = new Date().toISOString();
    const [saved] = await getDb().update(eventDocuments).set({ complete: true, ...(restoredDates ?? { uploadedAt, expiresAt: documentExpiry(new Date(uploadedAt)) }) }).where(and(eq(eventDocuments.id, document.id), eq(eventDocuments.complete, false))).returning();
    if (!saved) return Response.json({ error: "La carga cambió. Actualizá los documentos." }, { status: 409 });
    return Response.json({ document: documentInfo(saved) });
  } catch (error) {
    console.error("Unable to complete PDF", error);
    return Response.json({ error: "No se pudo finalizar la carga del PDF." }, { status: 500 });
  }
}
export async function DELETE(_request: Request, context: Context) {
  try {
    const document = await getDocument(context);
    if (document) await getDb().delete(eventDocuments).where(eq(eventDocuments.id, document.id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete PDF", error);
    return Response.json({ error: "No se pudo eliminar el PDF." }, { status: 500 });
  }
}
