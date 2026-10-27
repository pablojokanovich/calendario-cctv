import assert from "node:assert/strict";
import test from "node:test";
import { canonicalServiceName, serviceCategory, serviceOptions } from "../lib/services.ts";

test("service aliases group spelling, camera words, component order and capitalization", () => {
  for (const group of [
    ["CCTV A 1 HD", "cctv a 1 cámara hd"],
    ["CCTV 2 BROADCAST", "CCTV A 2 BROADCAST", "CCTV A 2 HD (BROADCAST)"],
    ["VMIX+3 PTZ", "3 PTZ + VMIX"],
    ["VMIX + 1 PTZ", "1 PTZ + VMIX"],
    ["2 SONY", "CCTV A 2", "CCTV A 2 HD", "CCTV a 2 cámaras Sony", "CCTV a 2 cámaras HD"],
    ["1 PTZ", "1 PTZ PARA TEAMS", "1 PTZ PARA ZOOM", "Cámara PTZ 1 PARA ZOOM", "1 PTZ PARA ZOOM (PUBLICO)", "1 PTZ CON GRABACION", "1 PTZ POR VMIX"],
    ["HIBRIDO", "CCTV HÍBRIDO"],
  ]) for (const item of group) assert.equal(canonicalServiceName(item), canonicalServiceName(group[0]));
  assert.equal(new Set(serviceOptions).size, serviceOptions.length);
  for (const option of serviceOptions) assert.equal(canonicalServiceName(option), option);
});

test("configurations retain quantities, camera models, workflows and incomplete descriptions", () => {
  for (const [a, b] of [["1 PTZ", "2 PTZ"], ["CCTV A 2 SONY", "CCTV A 2 BROADCAST"], ["VMIX", "GRABACION VMIX"], ["CCTV A 2", "CCTV A 2 + VMIX"], ["CCTV A 3 BROADCAST +", "CCTV A 3 BROADCAST"], ["1 PTZ", "VMIX + 1 PTZ"]]) {
    assert.notEqual(canonicalServiceName(a), canonicalServiceName(b));
  }
  assert.equal(canonicalServiceName("  CCTV A 3 + GIMBAL Y 2  "), "CCTV A 3 + GIMBAL Y 2");
});

test("service categories separate mixed setups without guessing unknown equipment", () => {
  const examples = [["2 SONY", "CCTV"], ["3 BROADCAST + VMIX", "CCTV + vMix"], ["1 PTZ PARA TEAMS", "PTZ"], ["VMIX + 1 PTZ", "PTZ + vMix"], ["GRABACION VMIX", "vMix"], ["CCTV 2 HIBRIDO", "Híbrido"], ["10 Arri Skypanel S30C", "Iluminación"], ["VALIJA HOLLYLAND", "Hollyland"], ["Servicio pendiente", "Otros"], ["", "Sin especificar"]];
  for (const [input, expected] of examples) assert.equal(serviceCategory(input), expected);
  assert.equal(serviceCategory("CCTV A 2 PTZ"), serviceCategory("2 PTZ"));
  assert.equal(serviceCategory("CCTV A 2 PTZ + VMIX"), serviceCategory("VMIX + 2 PTZ"));
  assert.equal(serviceCategory("CCTV A 3 PTZ + 1 EN MANO"), "CCTV");
});
