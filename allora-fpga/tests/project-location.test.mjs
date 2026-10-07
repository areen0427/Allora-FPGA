import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the hook's async behavior without a browser or native folder dialog.
const source = await readFile(
  new URL("../src/hooks/useProjectLocation.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace(/^import .*;\n/gm, "");
const moduleSource = `
const { useRef, useState, getLastProjectParentDirectory, pickProjectParentDirectory, hasTauriInvoke } = globalThis.projectLocationHarness;
${compiled}`;
let moduleId = 0;

async function createHarness({
  nativeAvailable = true,
  lastDirectory = null,
  pickDirectory = async () => null,
} = {}) {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0, storedDirectoryReads = 0, pickerCalls = 0;
  globalThis.projectLocationHarness = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) {
      return refs[refIndex++] ??= { current: initial };
    },
    getLastProjectParentDirectory() { storedDirectoryReads++; return lastDirectory; },
    pickProjectParentDirectory() { pickerCalls++; return pickDirectory(); },
    hasTauriInvoke: () => nativeAvailable,
  };
  const { useProjectLocation } = await import(
    `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}#${moduleId++}`
  );
  delete globalThis.projectLocationHarness;
  return {
    render(mode = "ask", defaultLabel = "AlloraProjects") {
      stateIndex = 0;
      refIndex = 0;
      return useProjectLocation(mode, defaultLabel);
    },
    get storedDirectoryReads() { return storedDirectoryReads; },
    get pickerCalls() { return pickerCalls; },
  };
}

test("location modes keep their requirements and screen-specific default labels", async () => {
  for (const [mode, requiresLocation, label] of [
    ["ask", true, "Choose a location"],
    ["last-used", true, "Choose a location (no previous location found)"],
    ["documents", false, "Documents/Allora FPGA Projects"],
  ]) {
    const harness = await createHarness();
    const location = harness.render(mode, "Documents/Allora FPGA Projects");
    assert.equal(location.requiresLocation, requiresLocation);
    assert.equal(location.locationLabel, label);
    assert.equal(harness.storedDirectoryReads, mode === "last-used" ? 1 : 0);
  }
  const browser = await createHarness({ nativeAvailable: false });
  const location = browser.render();
  assert.equal(location.nativeAvailable, false);
  assert.equal(location.requiresLocation, false);
  await location.chooseLocation();
  assert.equal(browser.pickerCalls, 0, "browser projects must not invoke the native dialog");
});

test("last-used directory loads once and remains the selected parent across renders", async () => {
  const harness = await createHarness({ lastDirectory: "/projects" });
  for (const mode of ["last-used", "last-used", "documents"]) {
    const location = harness.render(mode);
    assert.equal(location.parentDirectory, "/projects");
    assert.equal(location.locationLabel, "/projects");
    assert.equal(location.requiresLocation, false);
  }
  assert.equal(harness.storedDirectoryReads, 1);
});

test("folder selection blocks duplicate calls before rerender and cancellation keeps the current parent", async () => {
  let finishPicking;
  const harness = await createHarness({
    lastDirectory: "/previous",
    pickDirectory: () => new Promise(resolve => { finishPicking = resolve; }),
  });
  let location = harness.render("last-used");
  const firstPick = location.chooseLocation();
  await location.chooseLocation();
  location = harness.render("last-used");
  assert.equal(location.isChoosingLocation, true);
  assert.equal(harness.pickerCalls, 1);
  finishPicking(null);
  await firstPick;
  location = harness.render("last-used");
  assert.equal(location.isChoosingLocation, false);
  assert.equal(location.parentDirectory, "/previous");
  assert.equal(location.locationError, "");
});

test("dialog failure is surfaced, releases its lock and can be retried successfully", async () => {
  let fail = true;
  const harness = await createHarness({
    pickDirectory: async () => {
      if (fail) throw new Error("Folder access denied");
      return "/new-projects";
    },
  });
  await harness.render().chooseLocation();
  let location = harness.render();
  assert.equal(location.locationError, "Folder access denied");
  assert.equal(location.isChoosingLocation, false);
  assert.equal(location.requiresLocation, true);
  fail = false;
  await location.chooseLocation();
  location = harness.render();
  assert.equal(location.locationError, "");
  assert.equal(location.parentDirectory, "/new-projects");
  assert.equal(location.requiresLocation, false);
  assert.equal(harness.pickerCalls, 2);
});
