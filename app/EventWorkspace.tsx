"use client";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Package, Plus, Printer, Search, Trash2, X } from "lucide-react";
import type { EventRecord } from "../lib/agenda";
import { emptyWorkspace, remainingEquipment, validateWorkspace, type CatalogArea, type EventWorkspace as Workspace } from "../lib/event-workspace";

export type WorkspaceHandle = { save: () => Promise<boolean> };
type Props = { event: EventRecord; localMode: boolean; onBusyChange: (busy: boolean) => void; onDirtyChange: (dirty: boolean) => void };
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || "No se pudo completar la operación.");
  return data;
}
function escape(value: string | number) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }

export const EventWorkspace = forwardRef<WorkspaceHandle, Props>(function EventWorkspace({ event, localMode, onBusyChange, onDirtyChange }, ref) {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [catalog, setCatalog] = useState<CatalogArea[]>([]);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState("");
  const [customName, setCustomName] = useState("");
  const [roomId, setRoomId] = useState(event.assignments[0]?.id || "");
  const [qty, setQty] = useState(1);
  const [target, setTarget] = useState("");
  const [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const available = event.id > 0 && !localMode;
  const endpoint = `/api/events/${event.id}/workspace`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/equipment-catalog.json", { signal: controller.signal }).then(response => readResponse<CatalogArea[]>(response)).then(setCatalog).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    setReady(false); setError("");
    void fetch(endpoint, { signal: controller.signal }).then(response => readResponse<{ workspace: Workspace }>(response)).then(data => {
      if (!controller.signal.aborted) { setWorkspace(data.workspace); setReady(true); setDirty(false); onDirtyChange(false); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [available, endpoint, retry, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const choices = catalog.flatMap(area => area.data.flatMap(category => category.items.map(name => ({ area: area.label, category: category.cat, name }))));
  const filtered = choices.map((choice, index) => ({ ...choice, key: String(index) })).filter(choice => `${choice.area} ${choice.category} ${choice.name}`.toLocaleLowerCase("es-AR").includes(query.toLocaleLowerCase("es-AR")));
  const room = event.assignments.find(room => room.id === roomId) || event.assignments[0];
  const targetPackage = workspace.packages.find(bulto => bulto.id === target) || workspace.packages[0];

  function change(next: Workspace) {
    if (!ready || busy) return;
    if (!validateWorkspace(next)) { setError("Revisá las cantidades: no pueden superar los equipos disponibles ni ser menores a uno."); return; }
    setWorkspace(next); setDirty(true); onDirtyChange(true); setError(""); setNotice("");
  }
  async function save() {
    if (!dirty) return true;
    if (!available || !ready || busy || !validateWorkspace(workspace)) return false;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const data = await readResponse<{ workspace: Workspace }>(await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(workspace) }));
      setWorkspace(data.workspace); setDirty(false); onDirtyChange(false); setNotice("Equipos y bultos guardados");
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudieron guardar los equipos."); return false; }
    finally { setBusy(false); onBusyChange(false); }
  }
  useImperativeHandle(ref, () => ({ save }));
  function addEquipment() {
    const selected = selection === "custom" ? { name: customName.trim(), area: "OTROS", category: "Equipo adicional" } : choices[Number(selection)];
    if (!selection || !selected?.name || !Number.isSafeInteger(qty) || qty < 1 || !room) { setError("Seleccioná un equipo, una sala y una cantidad válida."); return; }
    const existing = workspace.equipment.find(item => item.roomId === room.id && item.name === selected.name && item.area === selected.area && item.category === selected.category);
    const equipment = existing ? workspace.equipment.map(item => item.id === existing.id ? { ...item, qty: item.qty + qty } : item) : [...workspace.equipment, { id: crypto.randomUUID(), roomId: room.id, roomName: room.salon, ...selected, qty }];
    change({ ...workspace, equipment });
  }
  function removeEquipment(id: string) {
    if (workspace.packages.some(bulto => bulto.items.some(item => item.equipmentId === id)) && !window.confirm("¿Quitar este equipo y sus asignaciones a bultos?")) return;
    change({ equipment: workspace.equipment.filter(item => item.id !== id), packages: workspace.packages.map(bulto => ({ ...bulto, items: bulto.items.filter(item => item.equipmentId !== id) })) });
  }
  function assign(id: string, amount: number) {
    if (!targetPackage || !Number.isSafeInteger(amount) || amount < 1 || amount > remainingEquipment(workspace, id)) { setError("Elegí un bulto y una cantidad disponible."); return; }
    change({ ...workspace, packages: workspace.packages.map(bulto => bulto.id !== targetPackage.id ? bulto : {
      ...bulto, items: bulto.items.some(item => item.equipmentId === id) ? bulto.items.map(item => item.equipmentId === id ? { ...item, qty: item.qty + amount } : item) : [...bulto.items, { equipmentId: id, qty: amount }],
    }) });
  }
  function print(kind: "equipment" | "packages") {
    if (!workspace.equipment.length || (kind === "packages" && !workspace.packages.some(bulto => bulto.items.length))) { setError("Agregá equipos y armá los bultos antes de imprimir el remito."); return; }
    const popup = window.open("", "_blank");
    if (!popup) { setError("El navegador bloqueó la ventana de impresión."); return; }
    popup.opener = null;
    const rows = (items: { name: string; qty: number; roomName: string }[]) => `<table><thead><tr><th>Cantidad</th><th>Equipo</th><th>Sala</th></tr></thead><tbody>${items.map(item => `<tr><td>${item.qty}</td><td>${escape(item.name)}</td><td>${escape(item.roomName)}</td></tr>`).join("")}</tbody></table>`;
    const equipment = workspace.equipment.map(item => ({ ...item, roomName: event.assignments.find(room => room.id === item.roomId)?.salon || item.roomName }));
    const body = kind === "equipment" ? rows(equipment) : workspace.packages.filter(bulto => bulto.items.length).map(bulto => `<section><h2>${escape(bulto.name)}</h2>${rows(bulto.items.map(item => ({ ...equipment.find(equipment => equipment.id === item.equipmentId)!, qty: item.qty })))}</section>`).join("");
    popup.addEventListener("load", () => { popup.focus(); popup.print(); }, { once: true });
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${kind === "equipment" ? "Planilla" : "Remito"} ${escape(event.orderNumber)}</title><style>body{font:13px Arial;color:#111;margin:32px}header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #d71920;padding-bottom:16px}img{width:60px;height:60px;object-fit:contain}h1{font-size:22px}h2{font-size:15px;margin-top:24px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}section{break-inside:avoid}p{line-height:1.6}@page{margin:16mm}</style></head><body><header><img src="${window.location.origin}/congress-rental-logo.jpg" alt="Congress Rental"><h1>${kind === "equipment" ? "Planilla de equipos" : "Remito"} · Orden ${escape(event.orderNumber)}</h1></header><p><b>${escape(event.eventName)}</b><br>${escape(event.location)}<br>Armado: ${escape(event.setupDate || event.startDate)} · Inicio: ${escape(event.startDate)} · Fin: ${escape(event.endDate)}</p>${body}</body></html>`);
    popup.document.close();
  }
  if (!available) return <p className="document-note">Guardá el evento para cargar equipos y remitos en su ficha.</p>;
  return <section className="event-workspace" aria-label="Equipos y remitos del evento">
    <div className="workspace-heading"><h3>Equipos por sala</h3><div><button type="button" disabled={!ready || busy || !workspace.equipment.length} onClick={() => print("equipment")}><Printer size={15} />Imprimir planilla</button><button type="button" disabled={!ready || busy || !workspace.packages.some(bulto => bulto.items.length)} onClick={() => print("packages")}><Printer size={15} />Imprimir remito</button></div></div>
    {!ready && <p className="document-note">{error ? "Equipos no disponibles" : "Cargando equipos..."}</p>}
    {error && <div className="document-error" role="alert">{error}{!ready && <button type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button>}</div>}
    {notice && <p className="document-note" role="status">{notice}</p>}
    <fieldset disabled={!ready || busy}>
      <div className="equipment-add-fields">
        <label>Sala<select value={room?.id || ""} onChange={event => setRoomId(event.target.value)}>{event.assignments.map((room, index) => <option key={room.id} value={room.id}>{room.salon || `Sala ${index + 1}`}</option>)}</select></label>
        <label>Buscar en catálogo<div className="equipment-search"><Search size={15} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Equipo, área o categoría" /></div></label>
        <label className="equipment-choice">Equipo<select aria-label="Equipo del catálogo" value={selection} onChange={event => setSelection(event.target.value)}><option value="">Seleccionar equipo</option><option value="custom">Otro equipo</option>{filtered.map(choice => <option key={choice.key} value={choice.key}>{choice.area} · {choice.category} · {choice.name}</option>)}</select></label>
        {selection === "custom" && <label className="equipment-choice">Nombre del equipo<input value={customName} onChange={event => setCustomName(event.target.value)} /></label>}
        <label>Cantidad<input aria-label="Cantidad a agregar" type="number" min={1} max={100000} step={1} value={qty || ""} onChange={event => setQty(Number(event.target.value))} /></label>
        <button type="button" onClick={addEquipment}><Plus size={16} />Agregar equipo</button>
      </div>
      <div className="equipment-table-scroll"><table className="equipment-table"><thead><tr><th>Sala</th><th>Equipo</th><th>Cantidad</th><th>Sin bulto</th><th></th></tr></thead><tbody>{workspace.equipment.map(item => <tr key={item.id}>
        <td>{event.assignments.find(room => room.id === item.roomId)?.salon || item.roomName || "Sin sala"}</td><td><strong>{item.name}</strong><small>{item.area} · {item.category}</small></td><td><input aria-label={`Cantidad ${item.name}`} type="number" min={1} step={1} value={item.qty} onChange={event => change({ ...workspace, equipment: workspace.equipment.map(row => row.id === item.id ? { ...row, qty: Number(event.target.value) } : row) })} /></td><td>{remainingEquipment(workspace, item.id)}</td><td><button type="button" className="icon-button" title={`Quitar ${item.name}`} aria-label={`Quitar ${item.name}`} onClick={() => removeEquipment(item.id)}><Trash2 size={15} /></button></td>
      </tr>)}</tbody></table></div>
      {!workspace.equipment.length && <p className="document-note">Sin equipos cargados</p>}
      <div className="workspace-heading packages-heading"><h3><Package size={17} />Bultos del remito</h3><button type="button" onClick={() => { const id = crypto.randomUUID(); change({ ...workspace, packages: [...workspace.packages, { id, name: `BULTO ${workspace.packages.length + 1}`, items: [] }] }); setTarget(id); }}><Plus size={16} />Agregar bulto</button></div>
      {workspace.equipment.some(item => remainingEquipment(workspace, item.id) > 0) && <div className="package-pool"><label>Agregar al bulto<select aria-label="Bulto de destino" value={targetPackage?.id || ""} disabled={!workspace.packages.length} onChange={event => setTarget(event.target.value)}>{workspace.packages.map(bulto => <option key={bulto.id} value={bulto.id}>{bulto.name}</option>)}</select></label><ul>{workspace.equipment.filter(item => remainingEquipment(workspace, item.id) > 0).map(item => <PoolRow key={item.id} name={item.name} room={event.assignments.find(room => room.id === item.roomId)?.salon || item.roomName} remaining={remainingEquipment(workspace, item.id)} disabled={!targetPackage} onAdd={amount => assign(item.id, amount)} />)}</ul></div>}
      <div className="event-packages">{workspace.packages.map(bulto => <div className="event-package" key={bulto.id}><div className="package-heading"><input aria-label="Nombre del bulto" value={bulto.name} onChange={event => change({ ...workspace, packages: workspace.packages.map(row => row.id === bulto.id ? { ...row, name: event.target.value } : row) })} /><button type="button" className="icon-button" title={`Quitar bulto ${bulto.name}`} aria-label={`Quitar bulto ${bulto.name}`} onClick={() => { if (!bulto.items.length || window.confirm("¿Quitar el bulto y devolver sus equipos a la lista sin bulto?")) change({ ...workspace, packages: workspace.packages.filter(row => row.id !== bulto.id) }); }}><Trash2 size={15} /></button></div><ul>{bulto.items.map(item => <li key={item.equipmentId}><span>{workspace.equipment.find(row => row.id === item.equipmentId)?.name}</span><input aria-label={`Cantidad en ${bulto.name}`} type="number" min={1} step={1} value={item.qty} onChange={event => change({ ...workspace, packages: workspace.packages.map(row => row.id === bulto.id ? { ...row, items: row.items.map(current => current.equipmentId === item.equipmentId ? { ...current, qty: Number(event.target.value) } : current) } : row) })} /><button type="button" className="icon-button" title="Quitar equipo del bulto" aria-label={`Quitar equipo de ${bulto.name}`} onClick={() => change({ ...workspace, packages: workspace.packages.map(row => row.id === bulto.id ? { ...row, items: row.items.filter(current => current.equipmentId !== item.equipmentId) } : row) })}><X size={14} /></button></li>)}</ul>{!bulto.items.length && <p className="document-note">Sin equipos asignados</p>}</div>)}</div>
    </fieldset>
  </section>;
});

function PoolRow({ name, room, remaining, disabled, onAdd }: { name: string; room: string; remaining: number; disabled: boolean; onAdd: (amount: number) => void }) {
  const [qty, setQty] = useState(1);
  useEffect(() => setQty(current => Math.min(Math.max(current, 1), remaining)), [remaining]);
  return <li><span><strong>{name}</strong><small>{room} · {remaining} {remaining === 1 ? "disponible" : "disponibles"}</small></span><input type="number" aria-label={`Unidades de ${name} para bulto`} min={1} max={remaining} step={1} value={qty || ""} onChange={event => setQty(Number(event.target.value))} /><button type="button" title={`Agregar ${name} al bulto`} aria-label={`Agregar ${name} al bulto`} disabled={disabled} onClick={() => onAdd(qty)}><Plus size={15} /></button></li>;
}
