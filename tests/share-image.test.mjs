import assert from "node:assert/strict";
import test from "node:test";
import { shareImageFilename, shareImageSections } from "../lib/share-image.ts";

test("image layout preserves edited text, paragraphs, accents and literal markup", () => {
  assert.deepEqual(shareImageSections("  Congreso CCTV\r\nLugar: CEC\r\nArmado: 28/10/2026\r\n\r\nSala A\r\nDirector: Maca\r\n\r\nSala B\nCamarógrafos: Lucas <video>  "), {
    title: "Congreso CCTV", blocks: ["Lugar: CEC\nArmado: 28/10/2026", "Sala A\nDirector: Maca", "Sala B\nCamarógrafos: Lucas <video>"],
  });
  assert.deepEqual(shareImageSections("Solo un título"), { title: "Solo un título", blocks: [] });
  assert.deepEqual(shareImageSections("  \n"), { title: "", blocks: [] });
});

test("image filenames are safe and retain the event order", () => {
  assert.equal(shareImageFilename("0029", "Congreso / CCTV"), "resumen_0029_Congreso_CCTV.jpg");
  assert.equal(shareImageFilename("", ""), "resumen_sin_orden_evento.jpg");
  assert.ok(!shareImageFilename('00<>:"/\\|?*7', "nombre\ncon salto").includes("\n"));
  assert.ok(shareImageFilename("x".repeat(1000), "y".repeat(1000)).length < 180);
});
