import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "./index";
import { documentChunks, eventDocuments, events } from "./schema";
import { ensureServiceOrderTable } from "./service-orders";
import { documentChunkBytes, type EventDocumentInfo } from "../lib/service-order";

let initialized: Promise<unknown> | null = null;
export function ensureDocuments() {
  initialized ??= (async () => {
    await ensureServiceOrderTable();
    await getDb().execute(sql`CREATE TABLE IF NOT EXISTS event_documents (
      id text PRIMARY KEY, event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name text NOT NULL, size integer NOT NULL CHECK (size > 0 AND size <= 10485760),
      uploaded_at text NOT NULL, expires_at text NOT NULL, complete boolean NOT NULL DEFAULT false
    )`);
    await getDb().execute(sql`CREATE TABLE IF NOT EXISTS event_document_chunks (
      document_id text NOT NULL REFERENCES event_documents(id) ON DELETE CASCADE,
      part integer NOT NULL CHECK (part >= 0 AND part < 10), content text NOT NULL,
      PRIMARY KEY(document_id, part)
    )`);
    await getDb().execute(sql`CREATE INDEX IF NOT EXISTS event_documents_event_idx ON event_documents(event_id)`);
    await getDb().execute(sql`CREATE INDEX IF NOT EXISTS event_documents_expiry_idx ON event_documents(expires_at)`);
    // Preserve existing attachments and their original upload dates before retiring the single-PDF storage.
    await getDb().execute(sql`INSERT INTO event_documents(id, event_id, name, size, uploaded_at, expires_at, complete)
      SELECT 'legacy-' || event_id, event_id, name, size, updated_at,
      to_char((updated_at::timestamptz + interval '30 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), false
      FROM event_service_orders ON CONFLICT(id) DO NOTHING`);
    await getDb().execute(sql`INSERT INTO event_document_chunks(document_id, part, content)
      SELECT 'legacy-' || old.event_id, part,
      encode(substring(decode(old.content, 'base64') FROM part * 1048576 + 1 FOR 1048576), 'base64')
      FROM event_service_orders old CROSS JOIN LATERAL generate_series(0, (old.size - 1) / 1048576) AS part
      ON CONFLICT(document_id, part) DO NOTHING`);
    await getDb().execute(sql`UPDATE event_documents d SET complete = true WHERE id LIKE 'legacy-%'
      AND (SELECT count(*) FROM event_document_chunks c WHERE c.document_id = d.id) = (d.size + 1048575) / 1048576`);
    await getDb().execute(sql`DELETE FROM event_service_orders old USING event_documents d
      WHERE d.id = 'legacy-' || old.event_id AND d.complete = true`);
  })().catch(error => { initialized = null; throw error; });
  return initialized;
}

export async function existingEventId(context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [event] = await getDb().select({ id: events.id }).from(events).where(eq(events.id, id));
  return event ? id : null;
}
export function documentInfo(row: typeof eventDocuments.$inferSelect): EventDocumentInfo {
  return { id: row.id, name: row.name, size: row.size, uploadedAt: row.uploadedAt, expiresAt: row.expiresAt };
}
export async function purgeExpiredDocuments(now = new Date().toISOString()) {
  await ensureDocuments();
  const removed = await getDb().delete(eventDocuments).where(lte(eventDocuments.expiresAt, now)).returning({ id: eventDocuments.id });
  return removed.length;
}
export async function listDocuments(eventId: number) {
  await purgeExpiredDocuments();
  const rows = await getDb().select().from(eventDocuments).where(and(eq(eventDocuments.eventId, eventId), eq(eventDocuments.complete, true))).orderBy(asc(eventDocuments.uploadedAt));
  return rows.map(documentInfo);
}
export async function findDocument(eventId: number, documentId: string) {
  await ensureDocuments();
  const [document] = await getDb().select().from(eventDocuments).where(and(eq(eventDocuments.eventId, eventId), eq(eventDocuments.id, documentId)));
  if (!document) return null;
  if (document.expiresAt <= new Date().toISOString()) {
    await getDb().delete(eventDocuments).where(eq(eventDocuments.id, document.id));
    return null;
  }
  return document;
}
export function documentResponse(document: typeof eventDocuments.$inferSelect) {
  let part = 0;
  const parts = Math.ceil(document.size / documentChunkBytes);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (part >= parts) { controller.close(); return; }
        const [chunk] = await getDb().select({ content: documentChunks.content }).from(documentChunks)
          .where(and(eq(documentChunks.documentId, document.id), eq(documentChunks.part, part++)));
        if (!chunk) throw new Error("Missing document chunk");
        controller.enqueue(new Uint8Array(Buffer.from(chunk.content, "base64")));
      } catch (error) { controller.error(error); }
    },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="documento.pdf"; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
