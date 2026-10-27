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
  const examples = [["2 SONY", "CCTV HD"], ["3 BROADCAST + VMIX", "CCTV Broadcast + vMix"], ["1 PTZ PARA TEAMS", "PTZ"], ["VMIX + 1 PTZ", "PTZ + vMix"], ["GRABACION VMIX", "vMix"], ["CCTV 2 HIBRIDO", "Híbrido"], ["10 Arri Skypanel S30C", "Iluminación"], ["VALIJA HOLLYLAND", "Hollyland"], ["Servicio pendiente", "Otros"], ["", "Sin especificar"]];
  for (const [input, expected] of examples) assert.equal(serviceCategory(input), expected);
  assert.equal(serviceCategory("CCTV A 2 PTZ"), serviceCategory("2 PTZ"));
  assert.equal(serviceCategory("CCTV A 2 PTZ + VMIX"), serviceCategory("VMIX + 2 PTZ"));
  assert.equal(serviceCategory("CCTV A 3 PTZ + 1 EN MANO"), "CCTV (tipo sin especificar)");
});

test("CCTV categories distinguish Broadcast from HD, also with vMix or additional PTZ", () => {
  assert.equal(serviceCategory("CCTV A 2 HD"), "CCTV HD");
  assert.equal(serviceCategory("CCTV A 2"), "CCTV HD");
  assert.equal(serviceCategory("CCTV A 2 BROADCAST"), "CCTV Broadcast");
  assert.equal(serviceCategory("CCTV A 2 HD (BROADCAST)"), "CCTV Broadcast");
  assert.equal(serviceCategory("CCTV A 2 HD + VMIX"), "CCTV HD + vMix");
  assert.equal(serviceCategory("CCTV A 2 BROADCAST + VMIX"), "CCTV Broadcast + vMix");
  assert.equal(serviceCategory("2 BROADCAST + PTZ"), "CCTV Broadcast");
  assert.equal(serviceCategory("CCTV A 1 HD + 1 PTZ"), "CCTV HD");
  assert.equal(serviceCategory("2 URSA + PTZ"), "CCTV URSA");
  assert.equal(serviceCategory("CCTV A 1"), "CCTV (tipo sin especificar)");
  assert.equal(serviceCategory("CCTV 1 BROADCAST + CCTV 2 HD"), "CCTV Broadcast + HD");
});

test("an unnumbered PTZ means one PTZ, alone or within a combined service", () => {
  for (const [a, b] of [
    ["PTZ", "1 PTZ"], ["ptz para teams", "1 PTZ PARA TEAMS"],
    ["BROADCAST + PTZ", "BROADCAST + 1 PTZ"],
    ["2 BROADCAST+PTZ", "2 BROADCAST + 1PTZ"],
    ["2 BROADCAST + PTZ + GIMBAL", "2 BROADCAST + 1 PTZ + GIMBAL"],
    ["VMIX + PTZ", "VMIX + 1 PTZ"], ["PTZ + VMIX", "1 PTZ + VMIX"],
  ]) assert.equal(canonicalServiceName(a), canonicalServiceName(b));
  assert.equal(canonicalServiceName("2 BROADCAST + 2PTZ"), "2 BROADCAST + 2 PTZ");
  assert.notEqual(canonicalServiceName("2 BROADCAST + PTZ"), canonicalServiceName("2 BROADCAST + 2 PTZ"));
  assert.notEqual(canonicalServiceName("PTZ"), canonicalServiceName("10 PTZ"));
  assert.equal(canonicalServiceName("2 BROADCAST + PTZ + 2 PTZ"), "2 BROADCAST + 1 PTZ + 2 PTZ");
});
