import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { newDraft } from "../lib/agenda.ts";

async function loadModule(path, bindings = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    transformers: { after: [context => root => ts.visitNode(root, function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const name = node.moduleSpecifier.text;
        return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral(bindings[name] || import.meta.resolve(name)), node.attributes);
      }
      return ts.visitEachChild(node, visit, context);
    })] },
  }).outputText;
  const url = "data:text/javascript;base64," + Buffer.from(output).toString("base64");
  return { url, module: await import(url) };
}

test("event APIs migrate legacy tables and persist daily meals and the meal-sheet status", async () => {
  const postgres = new PGlite();
  try {
    const schema = await loadModule("../db/schema.ts");
    globalThis.__eventMealsTestDb = drizzle(postgres, { schema: schema.module });
    const dbUrl = "data:text/javascript," + encodeURIComponent("export function getDb() { return globalThis.__eventMealsTestDb; }");
    const migration = await loadModule("../db/event-meals.ts", { "./index": dbUrl });
    const sql = await readFile(new URL("../database/neon-init.sql", import.meta.url), "utf8");
    const legacySchema = sql.slice(0, sql.indexOf("CREATE INDEX"))
      .replace("  meal_dates text NOT NULL DEFAULT '[]',", "")
      .replace("  meal_sheet_loaded boolean NOT NULL DEFAULT false,", "");
    await postgres.exec(legacySchema);
    await postgres.query("INSERT INTO events(order_number,event_name,location,setup_date,start_date,end_date,phase,color,assignments) VALUES ('OLD','Anterior','CEC','','2026-11-01','2026-11-01','EVENTO','#112233','[]')");
    const agenda = new URL("../lib/agenda.ts", import.meta.url).href;
    const collection = (await loadModule("../app/api/events/route.ts", { "../../../db": dbUrl, "../../../db/schema": schema.url, "../../../db/event-meals": migration.url, "../../../lib/agenda": agenda })).module;
    const item = (await loadModule("../app/api/events/[id]/route.ts", { "../../../../db": dbUrl, "../../../../db/schema": schema.url, "../../../../db/event-meals": migration.url, "../../../../lib/agenda": agenda })).module;
    const oldResponse = await collection.GET();
    assert.equal(oldResponse.status, 200);
    const old = (await oldResponse.json()).events[0];
    assert.deepEqual(old.mealDates, []); assert.equal(old.mealSheetLoaded, false);
    await migration.module.ensureEventMeals();
    const draft = { ...newDraft(), orderNumber: "0012", eventName: "Viandas", location: "CEC", setupDate: "2026-11-01", startDate: "2026-11-03", endDate: "2026-11-04", mealDates: ["2026-11-01", "2026-11-04", "2026-11-02"], mealSheetLoaded: true };
    const request = (method, body) => new Request("http://test/api/events", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const created = await collection.POST(request("POST", draft));
    assert.equal(created.status, 201);
    const event = (await created.json()).event;
    assert.deepEqual(event.mealDates, ["2026-11-01", "2026-11-04"]);
    assert.equal(event.mealSheetLoaded, true);
    const updated = await item.PUT(request("PUT", { ...event, mealDates: ["2026-11-03"], mealSheetLoaded: false }), { params: Promise.resolve({ id: String(event.id) }) });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).event.mealSheetLoaded, false);
    const reloaded = (await (await collection.GET()).json()).events.find(row => row.id === event.id);
    assert.deepEqual(reloaded.mealDates, ["2026-11-03"]); assert.equal(reloaded.mealSheetLoaded, false);
    const stored = (await postgres.query("SELECT meal_dates, meal_sheet_loaded FROM events WHERE id=$1", [event.id])).rows[0];
    assert.equal(stored.meal_dates, '["2026-11-03"]');
    assert.equal(stored.meal_sheet_loaded, false);
    assert.equal((await postgres.query("SELECT count(*) AS n FROM events")).rows[0].n, 2);
  } finally { delete globalThis.__eventMealsTestDb; await postgres.close(); }
});
