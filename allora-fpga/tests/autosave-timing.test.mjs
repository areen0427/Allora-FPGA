import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/hooks/useSaveProject.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/^import .*;\n/gm, "");
let id = 0;
async function harness(status) {
  const states = [status], refs = [], saved = [], timers = [];
  let stateIndex = 0, refIndex = 0, effects = [];
  const environment = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = value; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useEffect(effect) { effects.push(effect); },
    saveProject(project) { saved.push(project); },
    writeProjectFile: async () => {},
    getErrorMessage: String,
    window: {
      addEventListener() {}, removeEventListener() {},
      setTimeout(callback, delay) { const timer = { callback, delay, cancelled: false }; timers.push(timer); return timer; },
      clearTimeout(timer) { timer.cancelled = true; },
    },
  };
  globalThis.autosaveHarness = environment;
  const { useSaveProject } = await import(`data:text/javascript;base64,${Buffer.from(`const {useState,useRef,useEffect,saveProject,writeProjectFile,getErrorMessage,window}=globalThis.autosaveHarness;\n${compiled}`).toString("base64")}#${id++}`);
  delete globalThis.autosaveHarness;
  return {
    saved, timers,
    render(content) {
      stateIndex = refIndex = 0; effects = [];
      useSaveProject({ project: { id: "autosave-check", name: "Check" }, board: { id: "board" }, files: [{ name: "top.v", content }], activeFileName: "top.v", topLevelFileName: "top.v" });
      return effects;
    },
  };
}
test("dirty workspace autosaves at three seconds using the latest edits", async () => {
  const h = await harness("unsaved");
  const cleanups = h.render("first edit").map(effect => effect()).filter(Boolean);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, 3000);
  h.render("latest edit")[0]();
  h.timers[0].callback();
  await Promise.resolve();
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].files[0].content, "latest edit");
  cleanups.forEach(cleanup => cleanup());
  assert.equal(h.timers[0].cancelled, true);
});
test("saved workspace does not schedule redundant autosaves", async () => {
  const h = await harness("saved");
  const cleanups = h.render("unchanged").map(effect => effect()).filter(Boolean);
  assert.equal(h.timers.length, 0);
  assert.equal(h.saved.length, 0);
  cleanups.forEach(cleanup => cleanup());
});
