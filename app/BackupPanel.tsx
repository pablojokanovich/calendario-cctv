"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, X, ArchiveRestore } from "lucide-react";
import { dateIso, type EventRecord } from "../lib/agenda";
import { backupRequest, createBackup, downloadBackupBlob, planRestore, readBackup, restoreBackup, type AgendaBackup, type LoadedBackup } from "../lib/backup";

function filename() { return `respaldo-cctv-${dateIso(new Date())}-${Date.now()}.zip`; }
function preferences(theme: "light" | "dark"): AgendaBackup["settings"] {
  const contacts = localStorage.getItem("cr_freelancers");
  return { theme, ...(contacts ? { citationContacts: JSON.parse(contacts) } : {}) };
}

export function BackupPanel({ theme, catalogue, onClose, onBusyChange, onRestored, onTheme }: { theme: "light" | "dark"; catalogue: { operators: string[]; services: string[] }; onClose: () => void; onBusyChange: (busy: boolean) => void; onRestored: () => Promise<void>; onTheme: (theme: "light" | "dark") => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState<LoadedBackup | null>(null);
  const [current, setCurrent] = useState<EventRecord[]>([]);
  const [update, setUpdate] = useState(false);
  const [restoreTheme, setRestoreTheme] = useState(true);
  const gate = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  let plan: ReturnType<typeof planRestore> = [], planError = "";
  try { if (loaded) plan = planRestore(loaded.manifest, current, update); } catch (error) { planError = error instanceof Error ? error.message : "No se pudo preparar el plan."; }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { previous?.focus?.(); };
  }, []);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !gate.current) onClose();
      if (event.key !== "Tab") return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
      if (!items.length) { event.preventDefault(); return; }
      if (!panel.current?.contains(document.activeElement)) { event.preventDefault(); items[0].focus(); }
      else if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);
  function setWorking(value: boolean) { gate.current = value; if (value) panel.current?.focus(); setBusy(value); onBusyChange(value); }
  async function download() {
    if (gate.current) return;
    setWorking(true); setError("");
    try { downloadBackupBlob(await createBackup(preferences(theme), catalogue, setStatus), filename()); setStatus("Respaldo completo descargado"); }
    catch (error) { setError(error instanceof Error ? error.message : "No se pudo descargar el respaldo."); }
    finally { setWorking(false); }
  }
  async function inspect(file: File) {
    if (gate.current) return;
    setWorking(true); setError(""); setLoaded(null); setStatus("Verificando archivo y PDF...");
    try {
      const backup = await readBackup(file);
      const { events } = await backupRequest<{ events: EventRecord[] }>("/api/events");
      planRestore(backup.manifest, events, update);
      setLoaded(backup); setCurrent(events); setStatus("Respaldo verificado");
    } catch (error) { setError(error instanceof Error ? error.message : "El archivo no es un respaldo válido."); }
    finally { setWorking(false); }
  }
  async function restore() {
    if (gate.current || !loaded || planError || !plan.some(step => step.action !== "skip")) return;
    const creates = plan.filter(step => step.action === "create").length, updates = plan.filter(step => step.action === "update").length;
    if (!window.confirm(`¿Restaurar ${creates} eventos nuevos y actualizar ${updates} coincidencias? No se eliminarán otros eventos.${updates ? " Se descargará antes un respaldo del estado actual." : ""}`)) return;
    setWorking(true); setError("");
    try {
      if (updates) downloadBackupBlob(await createBackup(preferences(theme), catalogue, setStatus), filename());
      const result = await restoreBackup(loaded, plan, setStatus);
      if (restoreTheme) {
        onTheme(loaded.manifest.settings.theme);
        if (loaded.manifest.settings.citationContacts) localStorage.setItem("cr_freelancers", JSON.stringify(loaded.manifest.settings.citationContacts));
      }
      setCurrent((await backupRequest<{ events: EventRecord[] }>("/api/events")).events);
      await onRestored();
      setStatus(`${result.saved} ${result.saved === 1 ? "evento restaurado" : "eventos restaurados"} · ${result.pdfCount} PDF ${result.pdfCount === 1 ? "recuperado" : "recuperados"}${result.expired ? ` · ${result.expired} PDF vencidos omitidos` : ""}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo completar la restauración.");
      try { setCurrent((await backupRequest<{ events: EventRecord[] }>("/api/events")).events); await onRestored(); } catch { /* Keep the original restoration error visible. */ }
    } finally { setWorking(false); }
  }
  return <div className="backup-overlay"><div ref={panel} tabIndex={-1} className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title">
    <header className="backup-heading"><h2 id="backup-title">Respaldo completo</h2><button type="button" className="icon-button" aria-label="Cerrar respaldo" title="Cerrar" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <section className="backup-section"><h3>Descargar copia</h3><dl className="backup-scope"><div><dt>Agenda</dt><dd>Todos los eventos, salas, operadores y confirmaciones</dd></div><div><dt>Archivos</dt><dd>PDF vigentes, con vencimiento original</dd></div><div><dt>Equipos</dt><dd>Datos guardados en esta agenda</dd></div><div><dt>Preferencias</dt><dd>Tema, contactos locales de citaciones y catálogo de referencia</dd></div><div><dt>Generador externo</dt><dd>No incluido</dd></div></dl><button type="button" className="primary" disabled={busy} onClick={() => void download()}><Download size={17} />Descargar respaldo ZIP</button></section>
    <section className="backup-section"><h3>Restaurar copia</h3><label className="backup-file"><Upload size={17} />Archivo de respaldo<input type="file" accept=".zip,application/zip" aria-label="Archivo de respaldo" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void inspect(file); event.target.value = ""; }} /></label>
      {loaded && <><dl className="backup-summary"><div><dt>Creado</dt><dd>{new Date(loaded.manifest.createdAt).toLocaleString("es-AR")}</dd></div><div><dt>Eventos</dt><dd>{loaded.manifest.entries.length}</dd></div><div><dt>PDF</dt><dd>{loaded.manifest.entries.reduce((n, e) => n + e.documents.length, 0)}</dd></div></dl>
        <label className="backup-check"><input type="checkbox" checked={update} disabled={busy} onChange={event => setUpdate(event.target.checked)} />Actualizar eventos coincidentes y sus equipos</label><label className="backup-check"><input type="checkbox" checked={restoreTheme} disabled={busy} onChange={event => setRestoreTheme(event.target.checked)} />Restaurar preferencias locales</label>
        <p className="backup-plan">{plan.filter(s => s.action === "create").length} nuevos · {plan.filter(s => s.action === "update").length} a actualizar · {plan.filter(s => s.action === "skip").length} sin modificar</p>
        {planError && <p role="alert" className="error-message">{planError}</p>}<button type="button" disabled={busy || !!planError || !plan.some(step => step.action !== "skip")} onClick={() => void restore()}><ArchiveRestore size={17} />Restaurar respaldo</button>
      </>}
    </section>
    {busy && <progress aria-label="Operación de respaldo en curso" />}{status && <p role="status" className="backup-status">{status}</p>}{error && <p role="alert" className="error-message">{error}</p>}
  </div></div>;
}
