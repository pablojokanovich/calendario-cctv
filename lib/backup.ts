import JSZip from "jszip";
import { validateEvent, type EventRecord } from "./agenda.ts";
import { normalizeSearchText } from "./event-insights.ts";
import { validateWorkspace, type EventWorkspace } from "./event-workspace.ts";
import { documentChunkBytes, maxServiceOrderBytes, validateServiceOrder, type EventDocumentInfo } from "./service-order.ts";

const maxArchiveBytes = 200 * 1024 * 1024;
const maxManifestBytes = 20 * 1024 * 1024;
type ArchivedDocument = EventDocumentInfo & { path: string; sha256: string };
export type BackupEntry = { event: EventRecord; workspace: EventWorkspace; documents: ArchivedDocument[] };
export type AgendaBackup = { format: "congress-cctv-backup"; version: 1; createdAt: string; settings: { theme: "light" | "dark"; citationContacts?: { id: number; nombre: string; area: string; telefono: string }[] }; catalogue: { operators: string[]; services: string[] }; entries: BackupEntry[] };
export type LoadedBackup = { manifest: AgendaBackup; files: Map<string, Uint8Array> };
export type RestoreStep = { entry: BackupEntry; target: EventRecord | null; action: "create" | "update" | "skip" };

export async function backupRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || `No se pudo completar ${path}.`);
  return data as T;
}
async function digest(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export function downloadBackupBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function createBackup(settings: AgendaBackup["settings"], catalogue: AgendaBackup["catalogue"], progress: (message: string) => void): Promise<Blob> {
  const { events } = await backupRequest<{ events: EventRecord[] }>("/api/events");
  if (!Array.isArray(events) || events.length > 5000) throw new Error("La agenda supera el tamaño admitido para un respaldo.");
  const zip = new JSZip();
  const manifest: AgendaBackup = { format: "congress-cctv-backup", version: 1, createdAt: new Date().toISOString(), settings, catalogue, entries: [] };
  let total = 0;
  for (const [index, event] of events.entries()) {
    progress(`Respaldando ${index + 1} de ${events.length}: ${event.eventName}`);
    const root = `/api/events/${event.id}`;
    const { workspace } = await backupRequest<{ workspace: EventWorkspace }>(`${root}/workspace`);
    if (!validateWorkspace(workspace)) throw new Error(`Equipos inválidos: ${event.eventName}`);
    const { documents } = await backupRequest<{ documents: EventDocumentInfo[] }>(`${root}/documents`);
    const archived: ArchivedDocument[] = [];
    for (const [fileIndex, doc] of documents.entries()) {
      const response = await fetch(`${root}/documents/${encodeURIComponent(doc.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo respaldar ${doc.name}. Actualizá e intentá nuevamente.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const invalid = validateServiceOrder(doc.name, bytes);
      if (invalid || bytes.length !== doc.size) throw new Error(`PDF incompleto o inválido: ${doc.name}`);
      total += bytes.length;
      if (total > maxArchiveBytes) throw new Error("Los PDF superan el máximo de 200 MB por respaldo.");
      const path = `documents/${index}-${fileIndex}.pdf`;
      zip.file(path, bytes);
      archived.push({ ...doc, path, sha256: await digest(bytes) });
    }
    manifest.entries.push({ event, workspace, documents: archived });
  }
  const latest = (await backupRequest<{ events: EventRecord[] }>("/api/events")).events;
  if (JSON.stringify(latest) !== JSON.stringify(events)) throw new Error("La agenda cambió durante el respaldo. Volvé a descargarlo para incluir los cambios.");
  validateBackupManifest(manifest);
  const json = JSON.stringify(manifest, null, 2);
  if (new TextEncoder().encode(json).length > maxManifestBytes) throw new Error("Los datos de la agenda superan los 20 MB admitidos por respaldo.");
  zip.file("agenda.json", json);
  progress("Preparando archivo ZIP...");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } });
  if (blob.size > maxArchiveBytes) throw new Error("El archivo ZIP supera los 200 MB permitidos.");
  return blob;
}

function invalid(): never { throw new Error("El respaldo no es válido o pertenece a una versión no compatible."); }
export function validateBackupManifest(input: unknown): AgendaBackup {
  if (!input || typeof input !== "object") return invalid();
  const value = input as AgendaBackup;
  if (value.format !== "congress-cctv-backup" || value.version !== 1 || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.entries) || value.entries.length > 5000) return invalid();
  if (!value.settings || !["light", "dark"].includes(value.settings.theme) || !value.catalogue || ![value.catalogue.operators, value.catalogue.services].every(list => Array.isArray(list) && list.length <= 5000 && list.every(name => typeof name === "string" && name.length <= 1000))) return invalid();
  const contacts = value.settings.citationContacts;
  if (contacts !== undefined && (!Array.isArray(contacts) || contacts.length > 1000 || contacts.some(contact => !contact || !Number.isSafeInteger(contact.id) || ![contact.nombre, contact.area].every(text => typeof text === "string" && text.length <= 200 && !/[<>]/.test(text)) || typeof contact.telefono !== "string" || contact.telefono.length > 100 || !/^[0-9+().\s-]*$/.test(contact.telefono)))) return invalid();
  const ids = new Set<number>();
  const paths = new Set<string>();
  for (const entry of value.entries) {
    const event = entry?.event;
    if (!event || !Number.isSafeInteger(event.id) || event.id < 1 || ids.has(event.id)) return invalid();
    ids.add(event.id);
    if (![event.orderNumber, event.eventName, event.location, event.setupDate, event.startDate, event.endDate, event.color, event.phase].every(text => typeof text === "string" && text.length <= 10000) || !Array.isArray(event.assignments) || !event.assignments.length || event.assignments.length > 500) return invalid();
    for (const room of event.assignments) {
      if (!room || typeof room.id !== "string" || !room.crew || ![room.salon, room.serviceType, room.vmixType, room.status].every(text => typeof text === "string" && text.length <= 10000)) return invalid();
      for (const role of ["director", "cameras", "volante", "vmix"] as const) {
        if (!Array.isArray(room.crew[role]) || room.crew[role].length > 500 || room.crew[role].some(p => !p || typeof p.id !== "string" || typeof p.name !== "string" || typeof p.confirmed !== "boolean" || (p.dates !== undefined && (!Array.isArray(p.dates) || p.dates.some(day => typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)))))) return invalid();
      }
    }
    if (!["ARMADO", "EVENTO", "ARMADO + EVENTO"].includes(event.phase) || validateEvent(event) || !validateWorkspace(entry.workspace) || !Array.isArray(entry.documents) || entry.documents.length > 1000) return invalid();
    for (const doc of entry.documents) {
      if (!doc || typeof doc.name !== "string" || !doc.name.toLowerCase().endsWith(".pdf") || doc.name.length > 200 || !Number.isSafeInteger(doc.size) || doc.size < 8 || doc.size > maxServiceOrderBytes || typeof doc.path !== "string" || !/^documents\/\d+-\d+\.pdf$/.test(doc.path) || paths.has(doc.path) || !/^[a-f0-9]{64}$/.test(doc.sha256)) return invalid();
      const uploaded = Date.parse(doc.uploadedAt), expiry = Date.parse(doc.expiresAt);
      if (!Number.isFinite(uploaded) || !Number.isFinite(expiry) || expiry <= uploaded || expiry - uploaded > 30 * 86400000) return invalid();
      paths.add(doc.path);
    }
  }
  return value;
}

async function limitedEntry(file: JSZip.JSZipObject, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const parts: Uint8Array[] = []; let size = 0;
    // JSZip exposes bounded browser streams but omits this method from its file typings.
    const stream = (file as JSZip.JSZipObject & { internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream("uint8array");
    stream.on("data", part => {
      size += part.length;
      if (size > limit) { stream.pause(); reject(new Error("El contenido del respaldo supera el tamaño permitido.")); return; }
      parts.push(part);
    }).on("error", () => reject(new Error("No se pudo leer el contenido del respaldo."))).on("end", () => {
      const result = new Uint8Array(size); let offset = 0;
      for (const part of parts) { result.set(part, offset); offset += part.length; }
      resolve(result);
    }).resume();
  });
}
export async function readBackup(file: Blob): Promise<LoadedBackup> {
  if (file.size > maxArchiveBytes) throw new Error("El respaldo no puede superar los 200 MB.");
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
  catch { throw new Error("El archivo no es un respaldo ZIP válido."); }
  if (Object.keys(zip.files).length > 10000) return invalid();
  const json = zip.file("agenda.json");
  if (!json) return invalid();
  const content = new TextDecoder().decode(await limitedEntry(json, maxManifestBytes));
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Los datos del respaldo están dañados."); }
  const manifest = validateBackupManifest(parsed);
  const files = new Map<string, Uint8Array>(); let total = 0;
  for (const entry of manifest.entries) for (const doc of entry.documents) {
    const file = zip.file(doc.path);
    if (!file) throw new Error(`Falta el PDF ${doc.name}. No se restauró ningún evento.`);
    const bytes = await limitedEntry(file, doc.size);
    total += bytes.length;
    if (total > maxArchiveBytes || bytes.length !== doc.size || validateServiceOrder(doc.name, bytes) || await digest(bytes) !== doc.sha256) throw new Error(`El PDF ${doc.name} está incompleto o fue modificado.`);
    files.set(doc.path, bytes);
  }
  return { manifest, files };
}

function sameEvent(a: EventRecord, b: EventRecord) {
  const key = (s: string) => /^\d+$/.test(s.trim()) ? s.trim().replace(/^0+(?=\d)/, "") : normalizeSearchText(s);
  if (a.startDate.slice(0, 4) !== b.startDate.slice(0, 4)) return false;
  if (/^\d+$/.test(key(a.orderNumber)) && key(a.orderNumber) === key(b.orderNumber)) return true;
  return normalizeSearchText(a.eventName) === normalizeSearchText(b.eventName) && a.startDate === b.startDate;
}
export function planRestore(manifest: AgendaBackup, current: EventRecord[], updateExisting: boolean): RestoreStep[] {
  const used = new Set<number>();
  const seen: EventRecord[] = [];
  return manifest.entries.map(entry => {
    if (seen.some(event => sameEvent(event, entry.event))) throw new Error(`Hay eventos repetidos en el respaldo: ${entry.event.orderNumber}.`);
    seen.push(entry.event);
    const matches = current.filter(event => sameEvent(event, entry.event));
    if (matches.length > 1 || (matches[0] && used.has(matches[0].id))) throw new Error(`Coincidencia ambigua para ${entry.event.orderNumber}. No se restauró ningún evento.`);
    const target = matches[0] ?? null;
    if (target) used.add(target.id);
    return { entry, target, action: target ? updateExisting ? "update" : "skip" : "create" };
  });
}

export async function restoreBackup(backup: LoadedBackup, plan: RestoreStep[], progress: (message: string) => void) {
  let saved = 0, pdfCount = 0, expired = 0;
  try {
    for (const [index, step] of plan.entries()) {
      if (step.action === "skip") continue;
      progress(`Restaurando ${index + 1} de ${plan.length}: ${step.entry.event.eventName}`);
      // Match again immediately before writing, and never use a backup ID as the destination ID.
      const fresh = (await backupRequest<{ events: EventRecord[] }>("/api/events")).events;
      const checked = planRestore({ ...backup.manifest, entries: [step.entry] }, fresh, true)[0];
      if (step.action === "create" ? checked.target !== null : !checked.target || checked.target.id !== step.target?.id || JSON.stringify(checked.target) !== JSON.stringify(step.target)) throw new Error("La agenda cambió desde la revisión. Actualizá el plan antes de continuar.");
      const endpoint = step.action === "create" ? "/api/events" : `/api/events/${step.target!.id}`;
      const { event } = await backupRequest<{ event: EventRecord }>(endpoint, step.action === "create" ? "POST" : "PUT", step.entry.event);
      saved++;
      await backupRequest(`/api/events/${event.id}/workspace`, "PUT", step.entry.workspace);
      for (const doc of step.entry.documents) {
        if (doc.expiresAt <= new Date().toISOString()) { expired++; continue; }
        const bytes = backup.files.get(doc.path)!;
        const root = `/api/events/${event.id}/documents`;
        const listed = (await backupRequest<{ documents: EventDocumentInfo[] }>(root)).documents;
        let exists = false;
        for (const candidate of listed.filter(d => d.name === doc.name && d.size === doc.size)) {
          const response = await fetch(`${root}/${encodeURIComponent(candidate.id)}`, { cache: "no-store" });
          if (response.ok && await digest(new Uint8Array(await response.arrayBuffer())) === doc.sha256) { exists = true; break; }
        }
        if (exists) continue;
        const started = await backupRequest<{ document: EventDocumentInfo }>(root, "POST", { name: doc.name, size: doc.size });
        const upload = `${root}/${encodeURIComponent(started.document.id)}`;
        for (let offset = 0, part = 0; offset < bytes.length; offset += documentChunkBytes, part++) {
          const response = await fetch(`${upload}?part=${part}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new Blob([new Uint8Array(bytes.slice(offset, offset + documentChunkBytes)).buffer]) });
          if (!response.ok) throw new Error(`No se pudo restaurar ${doc.name}.`);
        }
        await backupRequest(upload, "POST", { restoreDates: { uploadedAt: doc.uploadedAt, expiresAt: doc.expiresAt } });
        pdfCount++;
      }
    }
    return { saved, pdfCount, expired };
  } catch (error) {
    throw new Error(`${saved} eventos guardados antes del error. ${error instanceof Error ? error.message : "No se pudo completar la restauración."} Podés revisar y reintentar actualizando coincidencias.`);
  }
}
