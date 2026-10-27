export const maxServiceOrderBytes = 10 * 1024 * 1024;
export const documentChunkBytes = 1024 * 1024;
export const documentRetentionDays = 30;
export type ServiceOrderInfo = { name: string; size: number; updatedAt: string };
export type EventDocumentInfo = { id: string; name: string; size: number; uploadedAt: string; expiresAt: string };

export function documentExpiry(date = new Date()) {
  return new Date(date.getTime() + documentRetentionDays * 86400000).toISOString();
}

export function validateServiceOrder(name: string, bytes: Uint8Array): string | null {
  if (!name.toLowerCase().endsWith(".pdf")) return "La orden de servicio debe ser un PDF.";
  if (bytes.length > maxServiceOrderBytes) return "El PDF no puede superar los 10 MB.";
  if (bytes.length < 8 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return "El archivo no es un PDF válido.";
  return null;
}
