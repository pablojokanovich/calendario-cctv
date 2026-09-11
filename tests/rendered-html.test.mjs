import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { act, create } from "react-test-renderer";
import { newDraft, normalizeEvent } from "../lib/agenda.ts";

// Exercise React reconciliation without launching or inspecting a browser.
async function loadApp() {
  const source = await readFile(new URL("../app/AgendaApp.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    transformers: { after: [context => root => ts.visitNode(root, function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier.text;
        const resolved = import.meta.resolve(specifier === "../lib/agenda" ? "../lib/agenda.ts" : specifier);
        return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral(resolved), node.attributes);
      }
      return ts.visitEachChild(node, visit, context);
    })] },
  }).outputText;
  return (await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"))).default;
}

test("room typing, inline edits, per-person confirmations, theme persistence and failed saves", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.window = {
    location: { hostname: "agenda.example" }, localStorage: globalThis.localStorage,
    matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, confirm: () => true,
  };
  const fixture = normalizeEvent({ ...newDraft(), id: 7, orderNumber: "0999", eventName: "Congreso", location: "CEC", startDate: "2026-09-20", endDate: "2026-09-21" });
  fixture.assignments[0].salon = "Sala inicial";
  fixture.assignments[0].crew.cameras = [{ id: "cam-a", name: "Lucas", confirmed: false }, { id: "cam-b", name: "Esteban", confirmed: false }];
  fixture.assignments[0].crew.director = [{ id: "dir-a", name: "Maca", confirmed: false }];
  fixture.assignments[0].crew.vmix = [{ id: "vmix-a", name: "Pablo", confirmed: false }];
  let saved = fixture;
  let failSave = false;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    if (!init?.method) return Response.json({ events: [saved] });
    requests.push({ url, ...init });
    if (failSave) return Response.json({ error: "No se pudo guardar online." }, { status: 500 });
    saved = normalizeEvent({ ...JSON.parse(init.body), id: 7 });
    return Response.json({ event: saved });
  };
  const App = await loadApp();
  let renderer;
  await act(async () => { renderer = create(React.createElement(App)); });
  const root = () => renderer.root;
  const button = label => root().findAllByType("button").find(b => b.props["aria-label"] === label || b.children.includes(label));
  const input = label => root().findAll(node => (node.type === "input" || node.type === "textarea") && node.props["aria-label"] === label)[0];
  async function click(label) {
    const found = button(label);
    assert.ok(found, "Missing button: " + label);
    await act(async () => found.props.onClick());
  }
  try {
    await click("Nuevo evento");
    let sala = root().findByProps({ placeholder: "Nombre de sala (opcional)" });
    const original = sala;
    for (const char of "Libertador ABC") {
      await act(async () => sala.props.onChange({ target: { value: sala.props.value + char } }));
      sala = root().findByProps({ placeholder: "Nombre de sala (opcional)" });
      assert.equal(sala, original, "Room field was remounted while typing");
    }
    assert.equal(sala.props.value, "Libertador ABC");
    await click("Cancelar");
    await click("Planilla");
    const sheetSala = input("Sala · 0999");
    await act(async () => sheetSala.props.onFocus());
    for (const char of " completa") {
      await act(async () => input("Sala · 0999").props.onChange({ target: { value: input("Sala · 0999").props.value + char } }));
      assert.equal(input("Sala · 0999"), sheetSala, "Inline room field was remounted");
    }
    for (const label of ["Confirmar Camarógrafos 1: Lucas", "Confirmar Director 1: Maca", "Confirmar vMix 1: Pablo"]) {
      await act(async () => input(label).props.onChange({ target: { checked: true } }));
    }
    assert.equal(input("Confirmar Camarógrafos 2: Esteban").props.checked, false);
    await click("Guardar ahora");
    assert.equal(requests.at(-1).method, "PUT");
    assert.equal(requests.at(-1).url, "/api/events/7");
    assert.equal(saved.assignments[0].salon, "Sala inicial completa");
    assert.deepEqual(saved.assignments[0].crew.cameras.map(p => p.confirmed), [true, false]);
    assert.equal(saved.assignments[0].crew.director[0].confirmed, true);
    assert.equal(saved.assignments[0].crew.vmix[0].confirmed, true);
    assert.equal(button("Guardar ahora"), undefined);

    await act(async () => input("Camarógrafos 1").props.onChange({ target: { value: "Rodri" } }));
    assert.equal(input("Confirmar Camarógrafos 1: Rodri").props.checked, false);
    failSave = true;
    await click("Guardar ahora");
    assert.equal(root().findByProps({ role: "alert" }).children[0], "No se pudo guardar online.");
    assert.equal(input("Camarógrafos 1").props.value, "Rodri");
    assert.ok(button("Guardar ahora"), "Failed save must keep editable draft");
    assert.equal(storage.has("congress-cctv-agenda-events"), false, "Online save errors must not claim local persistence");
    failSave = false;
    await click("Guardar ahora");
    await click("Activar modo oscuro");
    assert.equal(document.documentElement.dataset.theme, "dark");
    assert.equal(storage.get("congress-cctv-theme"), "dark");
    await act(async () => { renderer.unmount(); });
    await act(async () => { renderer = create(React.createElement(App)); });
    assert.equal(document.documentElement.dataset.theme, "dark");
    await click("Planilla");
    assert.equal(input("Sala · 0999").props.value, "Sala inicial completa");
    assert.equal(input("Camarógrafos 1").props.value, "Rodri");
    assert.equal(input("Confirmar Camarógrafos 2: Esteban").props.checked, false);
  } finally {
    await act(async () => renderer.unmount());
  }
});
