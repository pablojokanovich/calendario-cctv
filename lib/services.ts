import { normalizeSearchText } from "./event-insights.ts";

const definitions: [string, string[]][] = [
  ["CCTV a 1 cámara", ["CCTV A 1"]],
  ["CCTV a 2 cámaras", ["CCTV A 2", "2 SONY", "CCTV A 2 SONY", "CCTV A 2 CAMARAS SONY", "CCTV A 2 HD", "CCTV A 2 CAMARAS HD"]],
  ["CCTV a 1 cámara HD", ["CCTV A 1 HD", "CCTV A 1 CAMARA HD"]],
  ["CCTV a 2 cámaras Broadcast", ["CCTV 2 BROADCAST", "CCTV A 2 BROADCAST", "2 BROADCAST", "CCTV A 2 HD (BROADCAST)"]],
  ["CCTV a 3 cámaras Broadcast", ["CCTV 3 BROADCAST", "CCTV A 3 BROADCAST", "3 BROADCAST"]],
  ["CCTV a 1 cámara Sony", ["1 SONY", "CCTV A 1 SONY"]],
  ["CCTV a 2 cámaras URSA", ["2 URSA", "CCTV A 2 URSA"]],
  ["CCTV a 2 cámaras + vMix", ["CCTV A 2 + VMIX", "2 SONY + VMIX", "CCTV A 2 SONY + VMIX", "CCTV A 2 HD + VMIX", "CCTV A 2 CAMARAS HD + VMIX", "CCTV A 2 CAMARAS SONY + VMIX"]],
  ["CCTV a 1 cámara HD + vMix", ["CCTV A 1 HD + VMIX", "CCTV A 1 CAMARA HD + VMIX"]],
  ["CCTV a 3 cámaras Broadcast + vMix", ["3 BROADCAST + VMIX", "CCTV A 3 BROADCAST + VMIX"]],
  ["CCTV a 2 cámaras Broadcast + Gimbal", ["CCTV A 2 CAMARAS BROADCAST + GIMBAL"]],
  ["CCTV a 2 PTZ", ["CCTV A 2 PTZ", "A 2 PTZ"]],
  ["CCTV a 3 PTZ", ["CCTV A 3 PTZ"]],
  ["CCTV a 2 PTZ + vMix", ["CCTV A 2 PTZ + VMIX"]],
  ["1 PTZ", ["1PTZ", "1 PTZ PARA TEAMS", "1 PTZ PARA ZOOM", "CAMARA PTZ 1 PARA ZOOM", "1 PTZ PARA ZOOM (PUBLICO)", "1 PTZ CON GRABACION", "1 PTZ POR VMIX"]], ["2 PTZ", ["2PTZ"]],
  ["vMix", []],
  ["vMix + 1 PTZ", ["1 PTZ + VMIX"]],
  ["vMix + 2 PTZ", ["2 PTZ + VMIX"]],
  ["vMix + 3 PTZ", ["3 PTZ + VMIX"]],
  ["vMix (grabación)", ["GRABACION VMIX", "VMIX GRABACION"]],
  ["vMix con Zoom y envío a pantalla", ["VMIX CON ZOOM Y ENVIO A PANTALLA"]],
  ["CCTV híbrido", ["HIBRIDO", "CCTV HIBRIDO"]],
  ["CCTV híbrido a 2 cámaras", ["CCTV 2 HIBRIDO", "CCTV A 2 HIBRIDO"]],
];

function normalizePtzComponents(value: string): string {
  return value.trim().replace(/(^|\+)\s*ptz\b/gi, (_, separator: string) => `${separator}1 PTZ`)
    .replace(/\b(\d+)\s*ptz\b/gi, "$1 PTZ")
    .replace(/\s*\+\s*/g, " + ").replace(/\s+/g, " ");
}

function serviceKey(value: string): string {
  return normalizeSearchText(normalizePtzComponents(value));
}

const aliases = new Map<string, string>();
for (const [name, variants] of definitions) {
  for (const value of [name, ...variants]) aliases.set(serviceKey(value), name);
}

export const serviceOptions = definitions.map(([name]) => name);

export function canonicalServiceName(value: string): string {
  return aliases.get(serviceKey(value)) ?? normalizePtzComponents(value).toLocaleUpperCase("es-AR");
}

export function serviceCategory(value: string): string {
  const text = normalizeSearchText(canonicalServiceName(value));
  if (!text) return "Sin especificar";
  if (/\b(hibrido|hibrida)\b/.test(text)) return "Híbrido";
  const cctv = /\b(cctv|broadcast|ursa|sony|gimbal)\b/.test(text);
  const vmix = /\bvmix\b/.test(text);
  const ptz = /\b\d*ptz\b/.test(text);
  const otherCamera = /\b(broadcast|ursa|sony|gimbal|hd)\b|\ben mano\b/.test(text);
  if (ptz && !otherCamera) return vmix ? "PTZ + vMix" : "PTZ";
  if (cctv) return vmix ? "CCTV + vMix" : "CCTV";
  if (ptz) return vmix ? "PTZ + vMix" : "PTZ";
  if (vmix) return "vMix";
  if (/\bskypanel\b/.test(text)) return "Iluminación";
  if (/\bhollyland\b/.test(text)) return "Hollyland";
  return "Otros";
}
