"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { documentChunkBytes, maxServiceOrderBytes, validateServiceOrder, type EventDocumentInfo } from "../lib/service-order";

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || "No se pudo completar la operación. Intentá nuevamente.");
  return data;
}
export function EventDocuments({ eventId, localMode, onBusyChange }: { eventId: number | null; localMode: boolean; onBusyChange: (busy: boolean) => void }) {
  const [documents, setDocuments] = useState<EventDocumentInfo[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const available = !!eventId && eventId > 0 && !localMode;
  const endpoint = `/api/events/${eventId}/documents`;
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch(endpoint, { signal: controller.signal }).then(response => readResponse<{ documents: EventDocumentInfo[] }>(response))
      .then(data => { if (!controller.signal.aborted) setDocuments(data.documents); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [available, endpoint, retry]);

  async function upload() {
    if (busy || !files.length || !available) return;
    setBusy(true); onBusyChange(true); setError("");
    const successful = new Set<File>();
    let pendingId = "";
    let finalizing = false;
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        finalizing = false;
        if (file.size > maxServiceOrderBytes) throw new Error(`${file.name}: el máximo es 10 MB por PDF.`);
        const validation = validateServiceOrder(file.name, new Uint8Array(await file.slice(0, 8).arrayBuffer()));
        if (validation) throw new Error(`${file.name}: ${validation}`);
        setNotice(`Subiendo ${index + 1} de ${files.length}: ${file.name}`);
        const started = await readResponse<{ document: EventDocumentInfo }>(await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }),
        }));
        pendingId = started.document.id;
        const uploadUrl = `${endpoint}/${pendingId}`;
        for (let offset = 0, part = 0; offset < file.size; offset += documentChunkBytes, part++) {
          await readResponse(await fetch(`${uploadUrl}?part=${part}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file.slice(offset, offset + documentChunkBytes) }));
          setNotice(`Subiendo ${index + 1} de ${files.length} · ${Math.round(Math.min(offset + documentChunkBytes, file.size) / file.size * 100)}%`);
        }
        finalizing = true;
        const saved = await readResponse<{ document: EventDocumentInfo }>(await fetch(uploadUrl, { method: "POST" }));
        setDocuments(current => [...current, saved.document]);
        successful.add(file); pendingId = "";
      }
      setNotice(`${successful.size} ${successful.size === 1 ? "PDF guardado" : "PDF guardados"}`);
    } catch (error) {
      if (pendingId && !finalizing) await fetch(`${endpoint}/${pendingId}`, { method: "DELETE" }).catch(() => undefined);
      setNotice(successful.size ? `${successful.size} PDF guardados` : "");
      setError(error instanceof Error ? error.message : "No se pudieron cargar los PDF.");
    } finally {
      setFiles(current => current.filter(file => !successful.has(file)));
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false); onBusyChange(false);
    }
  }
  async function remove(document: EventDocumentInfo) {
    if (busy || !window.confirm(`¿Eliminar ${document.name}?`)) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      await readResponse(await fetch(`${endpoint}/${document.id}`, { method: "DELETE" }));
      setDocuments(current => current.filter(item => item.id !== document.id));
      setNotice("PDF eliminado");
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo eliminar el PDF."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <section className="service-order-section" aria-label="Documentos del evento">
    <div className="service-order-heading"><FileText size={18} /><h3>Documentos del evento</h3><span>Opcional · PDF · Hasta 10 MB por archivo</span></div>
    <p className="document-retention">Los PDF se eliminan automáticamente a los 30 días de su carga. El evento y sus demás datos se conservan.</p>
    {!available ? <p className="document-note">{localMode ? "Los adjuntos requieren conexión con la agenda compartida." : "Disponible después de guardar el evento."}</p> : <>
      {loading && <p className="document-note">Cargando documentos...</p>}
      {!loading && !documents.length && <p className="document-note">Sin PDF adjuntos</p>}
      <ul className="document-list">{documents.map(document => <li key={document.id} className="document-file">
        <div><a href={`${endpoint}/${document.id}`} target="_blank" rel="noreferrer"><FileText size={16} /><span>{document.name}</span><ExternalLink size={14} /></a><small>{document.size >= 1024 * 1024 ? `${(document.size / 1024 / 1024).toLocaleString("es-AR", { maximumFractionDigits: 2 })} MB` : `${Math.max(1, Math.round(document.size / 1024))} KB`} · Vence <time dateTime={document.expiresAt}>{new Date(document.expiresAt).toLocaleDateString("es-AR")}</time></small></div>
        <button type="button" className="icon-button" title={`Eliminar ${document.name}`} aria-label={`Eliminar ${document.name}`} disabled={busy} onClick={() => void remove(document)}><Trash2 size={16} /></button>
      </li>)}</ul>
      <label className="document-input">Agregar PDF (orden de servicio u otros)<input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" disabled={busy || loading} onChange={event => { setFiles(Array.from(event.target.files || [])); setError(""); setNotice(""); }} /></label>
      {files.length > 0 && <><ul className="document-selected">{files.map((file, index) => <li key={index}>{file.name}</li>)}</ul><button type="button" disabled={busy || loading} onClick={() => void upload()}><Upload size={16} />{busy ? "Subiendo PDF..." : `Subir ${files.length} PDF`}</button></>}
      {notice && <p className="document-note" role="status">{notice}</p>}
      {error && <div className="document-error" role="alert"><span>{error}</span><button type="button" disabled={busy} onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} />Actualizar documentos</button></div>}
    </>}
  </section>;
}
