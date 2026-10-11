import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/compactButtonGroups.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { findCompactButtonRuns } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const control = (item, left, top = 0) => ({ item, rect: { left, right: left + 40, top, bottom: top + 38 } });
test("three nearby actions group; pairs and larger gaps remain separate", () => {
  assert.deepEqual(findCompactButtonRuns([control("a", 0), control("b", 48)]), []);
  assert.deepEqual(findCompactButtonRuns([control("a", 0), control("b", 52), control("c", 104)]), [["a", "b", "c"]]);
  assert.deepEqual(findCompactButtonRuns([control("a", 0), control("b", 53), control("c", 106)]), []);
});
test("wrapping and vertical lists do not connect unrelated rows", () => {
  assert.deepEqual(findCompactButtonRuns([control("a", 0), control("b", 48), control("c", 96), control("d", 0, 46), control("e", 48, 46)]), [["a", "b", "c"]]);
  assert.deepEqual(findCompactButtonRuns([control("a", 0), control("b", 0, 46), control("c", 0, 92)]), []);
});
test("distance and minimum-count tokens can tune grouping", () => {
  assert.deepEqual(findCompactButtonRuns([control("a", 0), control("b", 56), control("c", 112)], 16), [["a", "b", "c"]]);
  assert.deepEqual(findCompactButtonRuns([control("a", 0), control("b", 48)], 12, 2), [["a", "b"]]);
});
