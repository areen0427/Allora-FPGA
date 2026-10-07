import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/chatUsage.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { contextPercent, contextColor } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
test("context uses the latest prompt footprint, not accumulated account tokens", () => {
  assert.equal(contextPercent({ last: { totalTokens: 500 }, total: { totalTokens: 8000 }, modelContextWindow: 1000 }), 50);
  assert.equal(contextPercent({ last: { totalTokens: 1200 }, modelContextWindow: 1000 }), 100);
  assert.equal(contextPercent({ last: { totalTokens: 0 }, modelContextWindow: null }), null);
  assert.equal(contextPercent(), null);
});
test("color thresholds interpolate only between specified ranges", () => {
  assert.equal(contextColor(49), "#34b77a");
  assert.equal(contextColor(55), "#e4b340");
  assert.equal(contextColor(75), "#e4b340");
  assert.equal(contextColor(80), "#e26666");
  assert.match(contextColor(52), /color-mix/);
  assert.match(contextColor(78), /color-mix/);
});
