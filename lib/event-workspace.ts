export type EquipmentItem = { id: string; roomId: string; roomName: string; name: string; area: string; category: string; qty: number };
export type PackageItem = { equipmentId: string; qty: number };
export type EventPackage = { id: string; name: string; items: PackageItem[] };
export type EventWorkspace = { equipment: EquipmentItem[]; packages: EventPackage[] };
export type CatalogArea = { label: string; data: { cat: string; items: string[] }[] };

export function emptyWorkspace(): EventWorkspace { return { equipment: [], packages: [] }; }
export function validateWorkspace(value: unknown): value is EventWorkspace {
  if (!value || typeof value !== "object") return false;
  const state = value as EventWorkspace;
  if (!Array.isArray(state.equipment) || !Array.isArray(state.packages) || state.equipment.length > 2000 || state.packages.length > 500) return false;
  const ids = new Set<string>();
  for (const item of state.equipment) {
    if (!item || ![item.id, item.roomId, item.roomName, item.name, item.area, item.category].every(text => typeof text === "string" && text.length <= 500)) return false;
    if (!item.id || ids.has(item.id) || !item.name.trim() || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 100000) return false;
    ids.add(item.id);
  }
  const packageIds = new Set<string>();
  const assigned = new Map<string, number>();
  for (const bulto of state.packages) {
    if (!bulto || typeof bulto.id !== "string" || !bulto.id || packageIds.has(bulto.id) || typeof bulto.name !== "string" || bulto.name.length > 500 || !Array.isArray(bulto.items) || bulto.items.length > 2000) return false;
    packageIds.add(bulto.id);
    const seen = new Set<string>();
    for (const item of bulto.items) {
      if (!item || !ids.has(item.equipmentId) || seen.has(item.equipmentId) || !Number.isSafeInteger(item.qty) || item.qty < 1) return false;
      seen.add(item.equipmentId);
      assigned.set(item.equipmentId, (assigned.get(item.equipmentId) || 0) + item.qty);
    }
  }
  return state.equipment.every(item => (assigned.get(item.id) || 0) <= item.qty);
}
export function remainingEquipment(workspace: EventWorkspace, id: string) {
  return (workspace.equipment.find(item => item.id === id)?.qty || 0) - workspace.packages.reduce((sum, bulto) => sum + bulto.items.filter(item => item.equipmentId === id).reduce((sum, item) => sum + item.qty, 0), 0);
}
