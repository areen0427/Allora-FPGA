import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/pages/dashboard/navigation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { sectionAfterTargetChange } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
test("target changes keep chat active in both directions, including parent synchronization", () => {
  assert.equal(sectionAfterTargetChange("simulate", "chat"), "chat");
  assert.equal(sectionAfterTargetChange("build", "chat"), "chat");
});
test("other sections retain their execution-target landing behavior", () => {
  assert.equal(sectionAfterTargetChange("simulate", "editor"), "peripheral-workbench");
  assert.equal(sectionAfterTargetChange("build", "peripheral-workbench"), "editor");
});
test("explicit navigation still overrides the current chat section", () => {
  assert.equal(sectionAfterTargetChange("build", "chat", "pin-mapping"), "pin-mapping");
});
