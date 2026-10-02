import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/chatModels.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { reasoningFor } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const model = (efforts, defaultEffort = "medium") => ({
  supportedReasoningEfforts: efforts.map((reasoningEffort) => ({ reasoningEffort, description: "" })),
  defaultReasoningEffort: defaultEffort,
});

test("model switches preserve supported effort and never send unavailable Ultra", () => {
  assert.equal(reasoningFor(model(["low", "medium", "high", "max", "ultra"]), "ultra"), "ultra");
  assert.equal(reasoningFor(model(["low", "medium", "high"]), "ultra"), "medium");
  assert.equal(reasoningFor(model(["low", "medium", "high", "max"]), "max"), "max");
});

test("models without Low use an advertised default or first choice", () => {
  assert.equal(reasoningFor(model(["medium", "high"]), "low"), "medium");
  assert.equal(reasoningFor(model(["high"], "medium"), "ultra"), "high");
});

test("missing reasoning metadata never invents a level", () => {
  assert.equal(reasoningFor(undefined, "ultra"), undefined);
  assert.equal(reasoningFor(model([]), "low"), undefined);
});

test("Medium is the fallback even when the model defaults to Low", () => {
  assert.equal(reasoningFor(model(["low", "medium", "high"], "low"), "unavailable"), "medium");
  assert.equal(reasoningFor(model(["low", "medium", "high"], "low"), "high"), "high");
});
