import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/savedProjectResults.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { sameSources, matchesSavedSimulator, readSavedResult } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const sources = [{ name: "src/top.sv", content: "module top; endmodule" }];
const config = { topModule: "top", engine: "verilator", clockFrequencyHz: 25000000, enableVcd: true, peripherals: [
  { id: "clock-0", type: "clock", label: "clk", signal: "clk", bit: 0, activeHigh: true },
  { id: "led-0", type: "led", label: "LED0", signal: "led", bit: 0, activeHigh: true },
] };
const saved = { topModule: "top", sourceFiles: sources, simulation: config, result: { compiled: true } };

test("saved simulator verification survives key ordering and unmapped UI defaults", () => {
  const reopened = { ...config, peripherals: [config.peripherals[0], { id: "reset-0", type: "reset", signal: null }, config.peripherals[1]] };
  const reordered = JSON.parse(JSON.stringify(reopened, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
  assert.equal(matchesSavedSimulator(saved, sources, "top", reordered, "simulation"), true);
});
test("changed RTL, top, clock or connections never restores a verified simulator", () => {
  assert.equal(matchesSavedSimulator(saved, [{ ...sources[0], content: "changed" }], "top", config, "simulation"), false);
  assert.equal(matchesSavedSimulator(saved, sources, "other", config, "simulation"), false);
  assert.equal(matchesSavedSimulator(saved, sources, "top", { ...config, clockFrequencyHz: 12000000 }, "simulation"), false);
  assert.equal(matchesSavedSimulator(saved, sources, "top", { ...config, peripherals: config.peripherals.slice(0, 1) }, "simulation"), false);
  assert.equal(matchesSavedSimulator({ ...saved, result: { compiled: false } }, sources, "top", config, "simulation"), false);
});
test("source matching rejects duplicate names, removed files and malformed reports", () => {
  assert.equal(sameSources([...sources, ...sources], sources), false);
  assert.equal(sameSources(sources, []), false);
  assert.equal(sameSources([{ name: "src/top.sv" }], sources), false);
  assert.equal(readSavedResult([{ name: "build/synthesis-diagram.json", content: "{" }], "build/synthesis-diagram.json"), null);
});

test("generated memory changes invalidate interactive verification", () => {
  const memory = [{ name: "src/generated/rom.hex", content: "01\n" }];
  const result = { ...saved, memoryFiles: memory };
  assert.equal(matchesSavedSimulator(result, sources, "top", config, "simulation", memory), true);
  assert.equal(matchesSavedSimulator(result, sources, "top", config, "simulation", [{ ...memory[0], content: "02\n" }]), false);
});
