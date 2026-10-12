import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/pages/dashboard/navigation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { sectionAfterWorkspaceLaunch, workspaceOwner } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
test("workspace synchronization preserves the active page, including chat and virtual tools", () => {
  for (const page of ["editor", "chat", "peripheral-workbench", "virtual-fpga", "bitstream"]) {
    assert.equal(sectionAfterWorkspaceLaunch(page), page);
  }
});
test("explicit tool launches override the active page", () => {
  assert.equal(sectionAfterWorkspaceLaunch("chat", "pin-mapping"), "pin-mapping");
  assert.equal(sectionAfterWorkspaceLaunch("editor", "peripheral-workbench"), "peripheral-workbench");
  assert.equal(sectionAfterWorkspaceLaunch("editor", "register-builder"), "register-builder");
});

test("moved tool destinations resolve to their owning workspace", () => {
  assert.equal(workspaceOwner("health"), "bitstream");
  assert.equal(workspaceOwner("serial"), "programming");
  for (const page of ["editor", "chat", "synthesis", "pin-mapping", "testbench", "virtual-fpga"]) {
    assert.equal(workspaceOwner(page), page);
  }
});

test("projectless workspaces resolve to explicit landing pages", async () => {
  const { welcomeDestination } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  for (const page of ["editor", "testbench", "synthesis", "bitstream", "programming", "virtual-fpga"]) {
    assert.equal(welcomeDestination(page), "build");
  }
  for (const page of ["pin-mapping", "peripheral-workbench", "memory-asset-studio", "register-builder"]) {
    assert.equal(welcomeDestination(page), page);
  }
});

test("workspace Back retraces Bitstream → Program without pushing a return visit", async () => {
  const { workspaceNavigationReducer: reduce } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  let state = { current: "editor", history: [] };
  state = reduce(state, { type: "visit", section: "bitstream" });
  state = reduce(state, { type: "visit", section: "programming" });
  state = reduce(state, { type: "back" });
  assert.deepEqual(state, { current: "bitstream", history: ["editor"] });
  state = reduce(state, { type: "back" });
  assert.deepEqual(state, { current: "editor", history: [] });
  assert.equal(reduce(state, { type: "back" }), state);
});
test("chat, tool and editor navigation share history; duplicates and owning-page aliases do not add entries", async () => {
  const { workspaceNavigationReducer: reduce } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  let state = { current: "programming", history: [] };
  state = reduce(state, { type: "visit", section: "serial" });
  assert.deepEqual(state.history, []);
  assert.equal(reduce(state, { type: "visit", section: "serial" }), state);
  for (const section of ["chat", "peripheral-workbench", "editor"]) state = reduce(state, { type: "visit", section });
  for (const section of ["peripheral-workbench", "chat", "serial"]) {
    state = reduce(state, { type: "back" });
    assert.equal(state.current, section);
  }
});
