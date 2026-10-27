import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { normalizeEvent, newDraft } from "../lib/agenda.ts";
import { createBackup, planRestore, readBackup, restoreBackup, validateBackupManifest } from "../lib/backup.ts";

const event = normalizeEvent({ ...newDraft(), id: 7, orderNumber: "0007", eventName: "Congreso", location: "CEC", setupDate: "2026-11-01", startDate: "2026-11-02", endDate: "2026-11-03" });
event.assignments[0].crew.cameras = [{ id: "person", name: "Cami", confirmed: true, dates: ["2026-11-02"] }];
const workspace = { equipment: [{ id: "cam", roomId: event.assignments[0].id, roomName: "A", name: "Camara", area: "CCTV", category: "Camaras", qty: 2 }], packages: [{ id: "case", name: "Bulto 1", items: [{ equipmentId: "cam", qty: 2 }] }] };
const bytes = new TextEncoder().encode("%PDF-1.4\nTEST PDF\n%%EOF");
const uploadedAt = new Date(Date.now() - 5 * 86400000).toISOString();
const doc = { id: "pdf", name: "Orden.pdf", size: bytes.length, uploadedAt, expiresAt: new Date(Date.parse(uploadedAt) + 30 * 86400000).toISOString() };
const settings = { theme: "dark", citationContacts: [{ id: 1, nombre: "Persona de prueba", area: "CCTV", telefono: "541100000000" }] }, catalogue = { operators: ["Camila Diamela"], services: ["CCTV A 2"] };

async function exportFixture() {
  const previous = globalThis.fetch;
  globalThis.fetch = async path => {
    if (path === "/api/events") return Response.json({ events: [event] });
    if (path.endsWith("/workspace")) return Response.json({ workspace });
    if (path.endsWith("/documents")) return Response.json({ documents: [doc] });
    if (path.endsWith("/documents/pdf")) return new Response(bytes);
    throw new Error("Unexpected path: " + path);
  };
  try { return await createBackup(settings, catalogue, () => {}); } finally { globalThis.fetch = previous; }
}

test("full ZIP backup round-trips assignments, settings, equipment, PDFs and their expiry", async () => {
  const loaded = await readBackup(await exportFixture());
  assert.deepEqual(loaded.manifest.entries[0].event, event);
  assert.deepEqual(loaded.manifest.entries[0].workspace, workspace);
  assert.deepEqual(loaded.manifest.settings, settings);
  assert.deepEqual(loaded.manifest.catalogue, catalogue);
  assert.equal(loaded.manifest.entries[0].documents[0].expiresAt, doc.expiresAt);
  assert.deepEqual(loaded.files.get("documents/0-0.pdf"), bytes);
  assert(!JSON.stringify(loaded.manifest).includes("password"));
});

test("corrupt PDF hashes, missing files, traversal paths and incompatible versions are rejected before writes", async () => {
  const blob = await exportFixture();
  const original = await readBackup(blob);
  for (const corrupt of [manifest => { manifest.version = 2; }, manifest => { manifest.entries[0].documents[0].path = "../secret.pdf"; }, manifest => { manifest.entries[0].event.endDate = "bad"; }]) {
    const manifest = structuredClone(original.manifest); corrupt(manifest);
    assert.throws(() => validateBackupManifest(manifest));
  }
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  zip.file("documents/0-0.pdf", "%PDF-1.4\nMODIFIED\n%%EOF");
  await assert.rejects(readBackup(await zip.generateAsync({ type: "blob" })), /incompleto|modificado|tamaño/);
  zip.remove("documents/0-0.pdf");
  await assert.rejects(readBackup(await zip.generateAsync({ type: "blob" })), /Falta el PDF/);
  const bomb = new JSZip(); bomb.file("agenda.json", "x".repeat(21 * 1024 * 1024));
  await assert.rejects(readBackup(await bomb.generateAsync({ type: "blob", compression: "DEFLATE" })), /tamaño/);
});

test("restore plans ignore source IDs, deduplicate orders and dates, and flag ambiguous matches", async () => {
  const { manifest } = await readBackup(await exportFixture());
  const unrelated = { ...event, id: 7, orderNumber: "0099", eventName: "Otro" };
  assert.equal(planRestore(manifest, [unrelated], false)[0].action, "create");
  const matching = { ...event, id: 20, orderNumber: "7" };
  assert.equal(planRestore(manifest, [matching], false)[0].action, "skip");
  assert.equal(planRestore(manifest, [matching], true)[0].target.id, 20);
  assert.throws(() => planRestore(manifest, [matching, { ...matching, id: 21 }], true), /ambigua/);
  assert.throws(() => planRestore({ ...manifest, entries: [...manifest.entries, ...manifest.entries] }, [], false), /repetidos/);
});

test("restoration maps new IDs, restores files and workspace, preserves unrelated events and is retry-safe", async () => {
  const backup = await readBackup(await exportFixture());
  const unrelated = { ...event, id: 7, orderNumber: "0099", eventName: "Otro" };
  let events = [unrelated], document = null, storedWorkspace = null, uploadedBytes = null, finalDates = null, uploads = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/events" && (!init.method || init.method === "GET")) return Response.json({ events });
    if (path === "/api/events" && init.method === "POST") { const saved = normalizeEvent({ ...JSON.parse(init.body), id: 30 }); events.push(saved); return Response.json({ event: saved }); }
    if (path === "/api/events/30" && init.method === "PUT") { const saved = normalizeEvent({ ...JSON.parse(init.body), id: 30 }); events = events.map(e => e.id === 30 ? saved : e); return Response.json({ event: saved }); }
    if (path.endsWith("/workspace")) { storedWorkspace = JSON.parse(init.body); return Response.json({ workspace: storedWorkspace }); }
    if (path.endsWith("/documents") && init.method === "GET") return Response.json({ documents: document ? [document] : [] });
    if (path.endsWith("/documents") && init.method === "POST") { uploads++; return Response.json({ document: { ...doc, id: "restored-pdf" } }); }
    if (path.endsWith("?part=0")) { uploadedBytes = new Uint8Array(await init.body.arrayBuffer()); return Response.json({ ok: true }); }
    if (path.endsWith("/restored-pdf") && init.method === "POST") { finalDates = JSON.parse(init.body).restoreDates; document = { ...doc, id: "restored-pdf", ...finalDates }; return Response.json({ document }); }
    if (path.endsWith("/restored-pdf")) return new Response(bytes);
    throw new Error("Unexpected request: " + path + " " + init.method);
  };
  try {
    const result = await restoreBackup(backup, planRestore(backup.manifest, events, false), () => {});
    assert.equal(result.saved, 1); assert.equal(result.pdfCount, 1);
    assert.deepEqual(events[0], unrelated); assert.equal(events[1].id, 30);
    assert.deepEqual(uploadedBytes, bytes); assert.deepEqual(storedWorkspace, workspace);
    assert.deepEqual(finalDates, { uploadedAt: doc.uploadedAt, expiresAt: doc.expiresAt });
    assert.equal((await restoreBackup(backup, planRestore(backup.manifest, events, false), () => {})).saved, 0);
    await restoreBackup(backup, planRestore(backup.manifest, events, true), () => {});
    assert.equal(uploads, 1);
    const expired = structuredClone(backup.manifest);
    expired.entries[0].documents[0].uploadedAt = new Date(Date.now() - 40 * 86400000).toISOString();
    expired.entries[0].documents[0].expiresAt = new Date(Date.now() - 10 * 86400000).toISOString();
    const skipped = await restoreBackup({ ...backup, manifest: expired }, planRestore(expired, events, true), () => {});
    assert.equal(skipped.expired, 1); assert.equal(uploads, 1);
    const outdated = structuredClone(backup.manifest); outdated.entries[0].event.eventName = "Nombre anterior";
    const plan = planRestore(outdated, events, true);
    events[1] = { ...events[1], eventName: "Cambio simultaneo" };
    await assert.rejects(restoreBackup({ ...backup, manifest: outdated }, plan, () => {}), /agenda cambió/);
  } finally { globalThis.fetch = previous; }
});

test("partial restore errors report saved events without deleting them or unrelated records", async () => {
  const backup = await readBackup(await exportFixture());
  const previous = globalThis.fetch;
  const events = [];
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/events" && init.method === "GET") return Response.json({ events });
    if (path === "/api/events" && init.method === "POST") { const saved = normalizeEvent({ ...JSON.parse(init.body), id: 31 }); events.push(saved); return Response.json({ event: saved }); }
    return Response.json({ error: "Fallo de conexión" }, { status: 500 });
  };
  try {
    await assert.rejects(restoreBackup(backup, planRestore(backup.manifest, [], false), () => {}), /1 eventos guardados antes del error/);
    assert.equal(events.length, 1);
    assert.equal(planRestore(backup.manifest, events, false)[0].action, "skip");
    assert.equal(planRestore(backup.manifest, events, true)[0].action, "update");
  } finally { globalThis.fetch = previous; }
});
