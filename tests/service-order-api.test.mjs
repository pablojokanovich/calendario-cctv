import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { newDraft, toPayload } from "../lib/agenda.ts";

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

test("PDF API persists, replaces, protects existing data on errors and cascades on event deletion", async () => {
  const postgres = new PGlite();
  try {
    const schema = await loadModule("../db/schema.ts");
    globalThis.__serviceOrderTestDb = drizzle(postgres, { schema: schema.module });
    const dbUrl = "data:text/javascript," + encodeURIComponent("export function getDb() { return globalThis.__serviceOrderTestDb; }");
    const initialization = await loadModule("../db/service-orders.ts", { "./index": dbUrl });
    const route = (await loadModule("../app/api/events/[id]/service-order/route.ts", {
      "../../../../../db": dbUrl,
      "../../../../../db/schema": schema.url,
      "../../../../../db/service-orders": initialization.url,
      "../../../../../lib/service-order": new URL("../lib/service-order.ts", import.meta.url).href,
    })).module;
    // Only create the original events table: the route initializes its own attachment table.
    const sql = await readFile(new URL("../database/neon-init.sql", import.meta.url), "utf8");
    await postgres.exec(sql.slice(0, sql.indexOf("CREATE TABLE IF NOT EXISTS event_service_orders")));
    const [event] = await globalThis.__serviceOrderTestDb.insert(schema.module.events).values(toPayload({ ...newDraft(), orderNumber: "QA", eventName: "Prueba", location: "CEC" })).returning();
    const context = { params: Promise.resolve({ id: String(event.id) }) };
    const url = `http://test/api/events/${event.id}/service-order`;
    const upload = (name, content) => {
      const form = new FormData();
      form.set("file", new File([content], name, { type: "application/pdf" }));
      return route.PUT(new Request(url, { method: "PUT", body: form }), context);
    };
    assert.deepEqual(await (await route.GET(new Request(url), context)).json(), { document: null });
    const bytes = "%PDF-1.4\nservice order\n%%EOF";
    const created = await upload("Orden Ñ.pdf", bytes);
    assert.equal(created.status, 200);
    assert.equal((await created.json()).document.name, "Orden Ñ.pdf");
    const metadata = await (await route.GET(new Request(url), context)).json();
    assert.equal(metadata.document.size, Buffer.byteLength(bytes));
    assert.equal("content" in metadata.document, false);
    const downloaded = await route.GET(new Request(url + "?download=1"), context);
    assert.equal(downloaded.headers.get("content-type"), "application/pdf");
    assert.equal(await downloaded.text(), bytes);
    assert.equal((await upload("fake.pdf", "not a pdf")).status, 400);
    assert.equal((await upload("too-big.pdf", new Uint8Array(3 * 1024 * 1024 + 1))).status, 413);
    assert.equal((await (await route.GET(new Request(url), context)).json()).document.name, "Orden Ñ.pdf");
    assert.equal((await upload("Reemplazo.pdf", bytes)).status, 200);
    assert.equal((await postgres.query("SELECT count(*) AS count FROM event_service_orders")).rows[0].count, 1);
    assert.equal((await route.DELETE(new Request(url, { method: "DELETE" }), context)).status, 200);
    assert.equal((await route.GET(new Request(url + "?download=1"), context)).status, 404);
    await upload("Orden.pdf", bytes);
    await postgres.query("DELETE FROM events WHERE id = $1", [event.id]);
    assert.equal((await postgres.query("SELECT count(*) AS count FROM event_service_orders")).rows[0].count, 0);
    assert.equal((await route.GET(new Request(url), context)).status, 404);
  } finally {
    delete globalThis.__serviceOrderTestDb;
    await postgres.close();
  }
});
