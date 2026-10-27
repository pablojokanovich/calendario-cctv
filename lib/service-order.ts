export const maxServiceOrderBytes = 3 * 1024 * 1024;
export type ServiceOrderInfo = { name: string; size: number; updatedAt: string };

export function validateServiceOrder(name: string, bytes: Uint8Array): string | null {
  if (!name.toLowerCase().endsWith(".pdf")) return "La orden de servicio debe ser un PDF.";
  if (bytes.length > maxServiceOrderBytes) return "El PDF no puede superar los 3 MB.";
  if (bytes.length < 8 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return "El archivo no es un PDF válido.";
  return null;
}
