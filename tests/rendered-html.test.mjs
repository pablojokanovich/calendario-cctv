import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { act, create } from "react-test-renderer";
import { dateIso, newDraft, normalizeEvent } from "../lib/agenda.ts";

// Exercise React reconciliation without launching or inspecting a browser.
async function loadApp() {
  const modules = {};
  async function compile(name) {
    const source = await readFile(new URL(`../app/${name}.tsx`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    transformers: { after: [context => root => ts.visitNode(root, function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier.text;
        const resolved = modules[specifier] || import.meta.resolve(specifier.startsWith("../lib/") ? `${specifier}.ts` : specifier);
        return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral(resolved), node.attributes);
      }
      return ts.visitEachChild(node, visit, context);
    })] },
    }).outputText;
    return "data:text/javascript;base64," + Buffer.from(output).toString("base64");
  }
  for (const name of ["EventDocuments"]) modules[`./${name}`] = await compile(name);
  return (await import(await compile("AgendaApp"))).default;
}

test("room typing, inline edits, per-person confirmations, theme persistence and failed saves", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.window = {
    setTimeout, clearTimeout,
    location: { hostname: "agenda.example" }, localStorage: globalThis.localStorage,
    matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, confirm: () => true,
  };
  const today = dateIso(new Date());
  const nextDate = new Date(`${today}T12:00:00`); nextDate.setDate(nextDate.getDate() + 1);
  const tomorrow = dateIso(nextDate);
  const fixture = normalizeEvent({ ...newDraft(), id: 7, orderNumber: "0999", eventName: "Congreso", location: "CEC", startDate: today, endDate: tomorrow });
  fixture.assignments[0].salon = "Sala inicial";
  fixture.assignments[0].crew.cameras = [{ id: "cam-a", name: "Lucas", confirmed: false }, { id: "cam-b", name: "Esteban", confirmed: false }];
  fixture.assignments[0].crew.director = [{ id: "dir-a", name: "Maca", confirmed: false }];
  fixture.assignments[0].crew.vmix = [{ id: "vmix-a", name: "Pablo", confirmed: false }];
  let saved = fixture;
  let failSave = false;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    if (url === "/equipment-catalog.json") return Response.json([]);
    if (url.endsWith("/workspace")) return Response.json({ workspace: { equipment: [], packages: [] } });
    if (url.endsWith("/documents")) return Response.json({ documents: [] });
    if (url.startsWith("/api/holidays")) return Response.json({ holidays: [{ date: today, name: "Feriado de prueba", nonWorking: false }] });
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
    const calendarEvent = root().findAllByProps({ className: "event-chip" })[0];
    const textContent = node => typeof node === "string" ? node : node.children.map(textContent).join("");
    const calendarText = textContent(calendarEvent);
    assert.ok(textContent(root().findByProps({ className: "holiday-label" })).includes("Feriado de prueba"));
    const overviewText = textContent(root().findByProps({ className: "event-overview-list" }));
    assert.ok(overviewText.includes("0 confirmados"));
    assert.ok(overviewText.includes("4 por confirmar"));
    for (const name of ["Lucas", "Esteban", "Maca", "Pablo", "Sala inicial"]) {
      assert.ok(calendarText.includes(name), "Calendar must show assigned room and operator: " + name);
    }
    await act(async () => input("Buscar eventos").props.onChange({ target: { value: "Congreso Lucas" } }));
    assert.ok(textContent(root().findByProps({ className: "search-results" })).includes("Congreso"));
    await click("Limpiar búsqueda");
    await click("Nuevo evento");
    assert.equal(root().findByProps({ className: "editor-panel" }).props["aria-labelledby"], "editor-title");
    await click("Citaciones");
    const citationFrame = root().findByType("iframe");
    await click("Datos");
    assert.equal(root().findByType("iframe"), citationFrame, "Changing dossier tabs must preserve citation input state");
    let sala = root().findByProps({ placeholder: "Nombre de sala (opcional)" });
    const original = sala;
    for (const char of "Libertador ABC") {
      await act(async () => sala.props.onChange({ target: { value: sala.props.value + char } }));
      sala = root().findByProps({ placeholder: "Nombre de sala (opcional)" });
      assert.equal(sala, original, "Room field was remounted while typing");
    }
    assert.equal(sala.props.value, "Libertador ABC");
    const plannerLink = root().findByProps({ className: "ficha-external-link" });
    assert.equal(plannerLink.props.target, "_blank");
    const plannerPayload = JSON.parse(new URLSearchParams(new URL(plannerLink.props.href).hash.slice(1)).get("agenda"));
    assert.deepEqual(plannerPayload.salas, ["Libertador ABC"]);
    assert.equal(root().findAllByProps({ className: "event-workspace" }).length, 0, "Integrated planner must be removed");
    let copiedText;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async text => { copiedText = text; } } } });
    await click("Copiar resumen");
    assert.ok(copiedText.includes("Libertador ABC"), "Copy must reflect unsaved room edits");
    assert.ok(root().findAllByProps({ role: "status" }).some(node => node.children.includes("Resumen copiado")));
    navigator.clipboard.writeText = async () => { throw new Error("Denied"); };
    await click("Copiar resumen");
    assert.ok(root().findAllByProps({ role: "status" }).some(node => node.children.some(child => typeof child === "string" && child.includes("No se pudo copiar"))));
    assert.ok(input("Resumen de salas y operadores").props.readOnly);
    assert.equal(requests.length, 0, "Copy must not save or send the event");
    await click("Cerrar ficha");
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
    assert.ok(root().findAllByProps({ className: "save-notice" }).length);
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
    await click("Orden de servicio y detalles 0999");
    await click("Salas y operadores");
    const panel = () => root().findByProps({ className: "editor-panel" });
    const field = label => panel().findAll(node => node.type === "input" && node.props["aria-label"] === label)[0];
    const shortTomorrow = nextDate.toLocaleDateString("es-AR");
    await act(async () => field(`Camarógrafos 1: Rodri · ${shortTomorrow}`).props.onChange({ target: { checked: false } }));
    const cameras = panel().findAll(node => node.props.role === "group" && node.props["aria-label"] === "Camarógrafos")[0];
    await act(async () => cameras.findByProps({ className: "add-person" }).props.onClick());
    await act(async () => field("Camarógrafos 3").props.onChange({ target: { value: "Guido" } }));
    await act(async () => field("Todos los días de Camarógrafos 3: Guido").props.onChange({ target: { checked: false } }));
    await act(async () => field(`Camarógrafos 3: Guido · ${shortTomorrow}`).props.onChange({ target: { checked: true } }));
    await click("Citaciones");
    const payload = JSON.parse(new URL(panel().findByType("iframe").props.src, "http://test").searchParams.get("payload"));
    assert.deepEqual(payload.people.find(p => p.name === "Rodri").days, [today]);
    assert.deepEqual(payload.people.find(p => p.name === "Guido").days, [tomorrow]);
    assert.deepEqual(payload.activeDates, [today, tomorrow]);
    await act(async () => panel().findByType("form").props.onSubmit({ preventDefault() {} }));
    assert.deepEqual(saved.assignments[0].crew.cameras[0].dates, [today]);
    assert.deepEqual(saved.assignments[0].crew.cameras[2].dates, [tomorrow]);
    await click("Cerrar ficha");
    await click("Calendario");
    const dayText = day => {
      const cell = root().findAllByType("article").find(article => article.findAllByType("time").some(time => time.props.dateTime === day));
      return textContent(cell);
    };
    assert.ok(dayText(today).includes("Rodri"));
    assert.ok(!dayText(today).includes("Guido"));
    assert.ok(dayText(tomorrow).includes("Guido"));
    assert.ok(!dayText(tomorrow).includes("Rodri"));
  } finally {
    await act(async () => renderer.unmount());
  }
});
