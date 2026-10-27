import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { newDraft, toPayload } from "../lib/agenda.ts";
import { documentChunkBytes, maxServiceOrderBytes } from "../lib/service-order.ts";

async function loadModule(path, bindings = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    transformers: { after: [context => root => ts.visitNode(root, function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier.text;
        return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral(bindings[specifier] || import.meta.resolve(specifier)), node.attributes);
      }
      return ts.visitEachChild(node, visit, context);
    })] },
  }).outputText;
  const url = "data:text/javascript;base64," + Buffer.from(output).toString("base64");
  return { url, module: await import(url) };
}

test("event dossier stores multiple 10 MB PDFs, migrates old files, expires only files and persists equipment", async () => {
  const postgres = new PGlite();
  try {
    const schema = await loadModule("../db/schema.ts");
    globalThis.__serviceOrderTestDb = drizzle(postgres, { schema: schema.module });
    const dbUrl = "data:text/javascript," + encodeURIComponent("export function getDb() { return globalThis.__serviceOrderTestDb; }");
    const initial = await loadModule("../db/service-orders.ts", { "./index": dbUrl });
    const sql = await readFile(new URL("../database/neon-init.sql", import.meta.url), "utf8");
    await postgres.exec(sql.slice(0, sql.indexOf("CREATE TABLE IF NOT EXISTS event_documents")));
    const createEvent = async number => (await globalThis.__serviceOrderTestDb.insert(schema.module.events).values(toPayload({ ...newDraft(), orderNumber: number, eventName: "Prueba", location: "CEC" })).returning())[0];
    const event = await createEvent("QA-1");
    const other = await createEvent("QA-2");
    const bytes = Buffer.alloc(maxServiceOrderBytes, 65); bytes.write("%PDF-1.4\n"); bytes.write("%%EOF", bytes.length - 5);
    const oldBytes = bytes.subarray(0, 2 * documentChunkBytes + 101);
    const oldDate = new Date(Date.now() - 10 * 86400000).toISOString();
    await postgres.query("INSERT INTO event_service_orders(event_id,name,size,content,updated_at) VALUES($1,$2,$3,$4,$5)", [event.id, "Orden anterior.pdf", oldBytes.length, oldBytes.toString("base64"), oldDate]);
    const service = new URL("../lib/service-order.ts", import.meta.url).href;
    const documents = await loadModule("../db/documents.ts", { "./index": dbUrl, "./schema": schema.url, "./service-orders": initial.url, "../lib/service-order": service });
    const list = (await loadModule("../app/api/events/[id]/documents/route.ts", { "../../../../../db": dbUrl, "../../../../../db/schema": schema.url, "../../../../../db/documents": documents.url, "../../../../../lib/service-order": service })).module;
    const file = (await loadModule("../app/api/events/[id]/documents/[documentId]/route.ts", { "../../../../../../db": dbUrl, "../../../../../../db/schema": schema.url, "../../../../../../db/documents": documents.url, "../../../../../../lib/service-order": service })).module;
    const cleanup = (await loadModule("../app/api/maintenance/expired-documents/route.ts", { "../../../../db/documents": documents.url })).module;
    const context = { params: Promise.resolve({ id: String(event.id) }) };
    const endpoint = `http://test/api/events/${event.id}/documents`;
    const request = (url, method = "GET", body) => new Request(url, { method, body });
    const fileContext = id => ({ params: Promise.resolve({ id: String(event.id), documentId: id }) });
    const listed = await (await list.GET(request(endpoint), context)).json();
    assert.equal(listed.documents.length, 1);
    assert.equal(listed.documents[0].name, "Orden anterior.pdf");
    assert.equal(listed.documents[0].uploadedAt, oldDate);
    assert.equal(new Date(listed.documents[0].expiresAt) - new Date(oldDate), 30 * 86400000);
    const oldDownload = await file.GET(request(endpoint), fileContext(listed.documents[0].id));
    assert.ok(Buffer.from(await oldDownload.arrayBuffer()).equals(oldBytes));
    assert.equal((await postgres.query("SELECT count(*) AS n FROM event_service_orders")).rows[0].n, 0);
    const tooBig = await list.POST(request(endpoint, "POST", JSON.stringify({ name: "big.pdf", size: maxServiceOrderBytes + 1 })), context);
    assert.equal(tooBig.status, 400);

    async function upload(name, content, checkIncomplete = false, restoreDates) {
      const started = await list.POST(request(endpoint, "POST", JSON.stringify({ name, size: content.length })), context);
      assert.equal(started.status, 201);
      const id = (await started.json()).document.id;
      const ctx = fileContext(id);
      if (checkIncomplete) {
        assert.equal((await file.POST(request(endpoint, "POST"), ctx)).status, 400);
        assert.equal((await file.GET(request(endpoint), ctx)).status, 404);
      }
      for (let offset = 0, part = 0; offset < content.length; offset += documentChunkBytes, part++) {
        const chunk = content.subarray(offset, offset + documentChunkBytes);
        assert.ok(chunk.length <= 1024 * 1024);
        assert.equal((await file.PUT(request(`${endpoint}?part=${part}`, "PUT", chunk), ctx)).status, 200);
      }
      const finished = await file.POST(request(endpoint, "POST", restoreDates ? JSON.stringify({ restoreDates }) : undefined), ctx);
      assert.equal(finished.status, 200);
      return (await finished.json()).document;
    }
    const large = await upload("Orden 10MB.pdf", bytes, true);
    assert.equal(new Date(large.expiresAt) - new Date(large.uploadedAt), 30 * 86400000);
    assert.equal((await file.PUT(request(endpoint + "?part=0", "PUT", bytes.subarray(0, documentChunkBytes)), fileContext(large.id))).status, 409);
    const downloaded = await file.GET(request(endpoint), fileContext(large.id));
    assert.equal(downloaded.headers.get("content-type"), "application/pdf");
    assert.ok(Buffer.from(await downloaded.arrayBuffer()).equals(bytes));
    const small = await upload("Plano.pdf", Buffer.from("%PDF-1.4\n%%EOF"));
    assert.equal((await (await list.GET(request(endpoint), context)).json()).documents.length, 3);
    const originalDates = { uploadedAt: oldDate, expiresAt: new Date(new Date(oldDate).getTime() + 30 * 86400000).toISOString() };
    const restored = await upload("Restaurado.pdf", Buffer.from("%PDF-1.4\n%%EOF"), false, originalDates);
    assert.equal(restored.uploadedAt, originalDates.uploadedAt);
    assert.equal(restored.expiresAt, originalDates.expiresAt);
    const invalidDates = { uploadedAt: oldDate, expiresAt: new Date(Date.now() + 60 * 86400000).toISOString() };
    assert.equal((await file.POST(request(endpoint, "POST", JSON.stringify({ restoreDates: invalidDates })), fileContext(restored.id))).status, 400);
    await file.DELETE(request(endpoint, "DELETE"), fileContext(restored.id));
    const wrongContext = { params: Promise.resolve({ id: String(other.id), documentId: large.id }) };
    assert.equal((await file.GET(request(endpoint), wrongContext)).status, 404);
    await file.DELETE(request(endpoint, "DELETE"), wrongContext);
    assert.equal((await file.GET(request(endpoint), fileContext(large.id))).status, 200);
    await postgres.query("UPDATE event_documents SET expires_at = $1 WHERE id = $2", [new Date(Date.now() - 1000).toISOString(), small.id]);
    assert.equal((await file.GET(request(endpoint), fileContext(small.id))).status, 404);
    assert.equal((await postgres.query("SELECT count(*) AS n FROM event_document_chunks WHERE document_id = $1", [small.id])).rows[0].n, 0);
    await postgres.query("UPDATE event_documents SET expires_at = $1 WHERE id = $2", [new Date(Date.now() - 1000).toISOString(), large.id]);
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "qa-secret";
    try {
      assert.equal((await cleanup.GET(request("http://test/cleanup"))).status, 401);
      assert.equal((await cleanup.GET(new Request("http://test/cleanup", { headers: { authorization: "Bearer qa-secret" } }))).status, 200);
    } finally { if (previousSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousSecret; }
    assert.equal((await (await list.GET(request(endpoint), context)).json()).documents.length, 1);
    assert.equal((await postgres.query("SELECT count(*) AS n FROM events")).rows[0].n, 2);

    const workspaceInit = await loadModule("../db/workspaces.ts", { "./index": dbUrl });
    const workspace = (await loadModule("../app/api/events/[id]/workspace/route.ts", { "../../../../../db": dbUrl, "../../../../../db/schema": schema.url, "../../../../../db/workspaces": workspaceInit.url, "../../../../../lib/event-workspace": new URL("../lib/event-workspace.ts", import.meta.url).href })).module;
    assert.deepEqual((await (await workspace.GET(request(endpoint), context)).json()).workspace, { equipment: [], packages: [] });
    const state = { equipment: [{ id: "equipment-1", roomId: "room-1", roomName: "A", name: "SONY Z150", area: "CCTV", category: "CAMARAS", qty: 3 }], packages: [{ id: "bulto-1", name: "BULTO 1", items: [{ equipmentId: "equipment-1", qty: 2 }] }] };
    assert.equal((await workspace.PUT(request(endpoint, "PUT", JSON.stringify(state)), context)).status, 200);
    assert.deepEqual((await (await workspace.GET(request(endpoint), context)).json()).workspace, state);
    const invalid = structuredClone(state); invalid.packages[0].items[0].qty = 4;
    assert.equal((await workspace.PUT(request(endpoint, "PUT", JSON.stringify(invalid)), context)).status, 400);
    assert.deepEqual((await (await workspace.GET(request(endpoint), context)).json()).workspace, state);
    await postgres.query("UPDATE event_documents SET expires_at = $1 WHERE event_id = $2", [new Date(Date.now() - 1000).toISOString(), event.id]);
    await documents.module.purgeExpiredDocuments();
    assert.deepEqual((await (await workspace.GET(request(endpoint), context)).json()).workspace, state);
    assert.equal((await postgres.query("SELECT count(*) AS n FROM events")).rows[0].n, 2);
    await postgres.query("DELETE FROM events WHERE id = $1", [event.id]);
    assert.equal((await postgres.query("SELECT count(*) AS n FROM event_documents")).rows[0].n, 0);
    assert.equal((await postgres.query("SELECT count(*) AS n FROM event_document_chunks")).rows[0].n, 0);
    assert.equal((await postgres.query("SELECT count(*) AS n FROM event_workspaces")).rows[0].n, 0);
  } finally {
    delete globalThis.__serviceOrderTestDb;
    await postgres.close();
  }
});
