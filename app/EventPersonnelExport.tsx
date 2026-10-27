"use client";
import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import type { EventRecord } from "../lib/agenda";
import { personnelFilename, personnelHeaders, personnelRows, personnelWorkbook } from "../lib/personnel-export";

export function EventPersonnelExport({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  const [lastDay, setLastDay] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const gate = useRef(false);
  const rows = personnelRows(event, lastDay).map(row => ({ ...row, dismantle: overrides[row.id] ?? row.dismantle }));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function keydown(e: KeyboardEvent) {
      if (e.key === "Escape" && !gate.current) onClose();
      if (e.key !== "Tab") return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      if (!items.length) { e.preventDefault(); return; }
      if (!panel.current?.contains(document.activeElement)) { e.preventDefault(); items[0].focus(); }
      else if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === items[items.length - 1]) { e.preventDefault(); items[0].focus(); }
    }
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("keydown", keydown); previous?.focus?.(); };
  }, [onClose]);
  async function download() {
    if (gate.current) return;
    gate.current = true; setBusy(true); setError(""); panel.current?.focus();
    try {
      const bytes = await personnelWorkbook(event, rows);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = personnelFilename(event); link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("No se pudo generar el Excel. Tus datos siguen disponibles para reintentar."); }
    finally { gate.current = false; setBusy(false); }
  }
  return <div className="backup-overlay"><div ref={panel} tabIndex={-1} className="backup-dialog personnel-dialog" role="dialog" aria-modal="true" aria-labelledby="personnel-title">
    <header className="backup-heading"><div><h2 id="personnel-title">Excel de personal</h2><p>#{event.orderNumber} · {event.eventName}</p></div><button type="button" className="icon-button" title="Cerrar" aria-label="Cerrar Excel de personal" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <label className="backup-check"><input type="checkbox" checked={lastDay} disabled={busy} onChange={e => { setLastDay(e.target.checked); setOverrides({}); }} />Desarme el último día de evento ({event.endDate.split("-").reverse().join("/")})</label>
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard access to the horizontally scrollable preview. */}
    <div className="personnel-preview" tabIndex={0} role="region" aria-label="Vista previa del Excel de personal"><table><thead><tr>{personnelHeaders.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.order}</td><td>{row.location}</td><td>{row.room}</td><td>{row.month}</td><td>{row.dateLabel}</td><td>{row.setup ? "☑" : "☐"}</td><td>{row.event ? "☑" : "☐"}</td><td><input type="checkbox" aria-label={`Desarme · ${row.person || "Sin personal"} · ${row.room || "Sin sala"} · ${row.monthKey} · ${row.position || "Sin puesto"}`} disabled={busy} checked={row.dismantle} onChange={e => setOverrides(current => ({ ...current, [row.id]: e.target.checked }))} /></td><td>{row.person}</td><td>{row.position}</td><td>{row.days}</td></tr>)}</tbody></table></div>
    {!rows.length && <p className="statistics-empty">Sin días de trabajo para exportar</p>}
    {error && <p className="error-message" role="alert">{error}</p>}<div className="individual-actions"><button type="button" className="primary" disabled={busy || !rows.length} onClick={() => void download()}><Download size={17} />{busy ? "Generando Excel..." : "Descargar Excel de personal"}</button></div>
  </div></div>;
}
