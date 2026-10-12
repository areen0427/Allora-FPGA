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
