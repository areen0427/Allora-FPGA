import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(relativePath) {
  const file = resolve(import.meta.dirname, relativePath);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    if (!name.startsWith(".")) return require(name);
    const base = resolve(dirname(file), name);
    const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    if (!target) throw new Error(`Cannot load ${name} from ${file}`);
    return load(target);
  }, exports);
  return exports;
}
const {
  inspectTestbenchSource,
  defaultTestbenchConfiguration,
  getTestbenchInputSignals,
  validateTestbenchConfiguration,
  uniqueTestbenchName,
  createTestbenchScaffold,
} = load("../src/lib/testbenchScaffold.ts");

function designFor(content, name = "top.sv") {
  const result = inspectTestbenchSource({ name, content });
  assert.equal(result.error, undefined);
  assert.equal(result.designs.length, 1);
  assert.equal(result.designs[0].error, undefined);
  return result.designs[0];
}

test("reads exact top interfaces, parameter widths and indexed one-bit buses", () => {
  const design = designFor(`\`timescale 1ns/1ps
    module top #(parameter WIDTH = 3)(input core_clk, reset_n, input [5:3] data,
      output [8:9] leds, output [4:4] ready, input [WIDTH-1:0] value, input [7:7] single, inout pad); endmodule`);
  assert.deepEqual(design.signals.map(signal => [signal.name, signal.direction, signal.indices]), [
    ["core_clk", "input", undefined], ["reset_n", "input", undefined],
    ["data", "input", [5, 4, 3]], ["leds", "output", [8, 9]],
    ["ready", "output", [4]], ["value", "input", [2, 1, 0]],
    ["single", "input", [7]], ["pad", "inout", undefined],
  ]);
  assert.deepEqual(getTestbenchInputSignals(design).map(signal => signal.name), ["core_clk", "reset_n"]);
  const config = { ...defaultTestbenchConfiguration(design), clockSignal: "core_clk" };
  const artifact = createTestbenchScaffold(design, config, [], "Test Board");
  assert.match(artifact.content, /reg \[5:3\] data = 3'd0;/);
  assert.match(artifact.content, /wire \[8:9\] leds;/);
  assert.match(artifact.content, /wire \[4:4\] ready;/);
  assert.match(artifact.content, /wire pad;/);
  assert.match(artifact.content, /\.single\(single\)/);
});

test("custom clock/reset names produce active-low reset and safe falling-edge release", () => {
  const design = designFor("module top(input sample_tick, clear_request, output done); endmodule");
  const config = {
    ...defaultTestbenchConfiguration(design), clockSignal: "sample_tick", frequencyMHz: "25",
    resetSignal: "clear_request", resetPolarity: "low", resetDurationNs: "20", simulationDurationNs: "100",
  };
  const validation = validateTestbenchConfiguration(design, config);
  assert.deepEqual(validation.errors, {});
  assert.equal(validation.timing.halfPeriodPs, 20_000);
  assert.equal(validation.timing.resetReleasePs, 40_001);
  const artifact = createTestbenchScaffold(design, config, [], "Test Board");
  assert.match(artifact.content, /reg clear_request = 1'd0;/);
  assert.match(artifact.content, /always #20 sample_tick = ~sample_tick;/);
  assert.match(artifact.content, /#40\.001 clear_request = 1'b1;/);
  assert.match(artifact.content, /#100;\n    \$finish/);
});

test("no clock or reset generates a combinational scaffold without invented ports", () => {
  const design = designFor("module top(input a, output z); assign z = a; endmodule");
  const config = defaultTestbenchConfiguration(design);
  config.frequencyMHz = "not used";
  config.resetDurationNs = "not used";
  const artifact = createTestbenchScaffold(design, config, [], "Test Board");
  assert.doesNotMatch(artifact.content, /always|reset|\.clk\(/);
  assert.match(artifact.content, /\.a\(a\),\n    \.z\(z\)/);
  const withReset = { ...config, resetSignal: "a", resetDurationNs: "2.125" };
  assert.match(createTestbenchScaffold(design, withReset, [], "Test Board").content, /#2\.125 a = 1'b0;/);
});

test("rejects invalid/zero timing, signal collisions, vector clocks and too-short simulation", () => {
  const design = designFor("module top(input clk, reset, input [4:4] bit_bus, output done); endmodule");
  const valid = defaultTestbenchConfiguration(design);
  for (const value of ["0", "-10", "Infinity", "NaN", "1e309", "250001", "0.0001", "5; $finish;"]) {
    assert.ok(validateTestbenchConfiguration(design, { ...valid, frequencyMHz: value }).errors.frequencyMHz, value);
  }
  for (const value of ["0", "-1", "NaN", "0.0001", "1.0001", "1000000001", "1; $finish;"]) {
    assert.ok(validateTestbenchConfiguration(design, { ...valid, resetDurationNs: value }).errors.resetDurationNs, value);
    assert.ok(validateTestbenchConfiguration(design, { ...valid, simulationDurationNs: value }).errors.simulationDurationNs, value);
  }
  assert.ok(validateTestbenchConfiguration(design, { ...valid, clockSignal: "bit_bus" }).errors.clockSignal);
  assert.ok(validateTestbenchConfiguration(design, { ...valid, resetSignal: "done" }).errors.resetSignal);
  assert.ok(validateTestbenchConfiguration(design, { ...valid, resetSignal: "clk" }).errors.resetSignal);
  assert.ok(validateTestbenchConfiguration(design, { ...valid, resetPolarity: "invalid" }).errors.resetPolarity);
  assert.ok(validateTestbenchConfiguration(design, { ...valid, simulationDurationNs: "30.001" }).errors.simulationDurationNs);
  assert.deepEqual(validateTestbenchConfiguration(design, { ...valid, frequencyMHz: "33.333333", simulationDurationNs: "1000.001" }).errors, {});
  assert.throws(() => createTestbenchScaffold(design, { ...valid, frequencyMHz: "0" }, [], "Board"), /frequency/);
});

test("file and module names stay unique and DUT signal names do not collide with instance names", () => {
  const files = [
    { name: "TOP_TB.SV", content: "module old; endmodule" },
    { name: "different.sv", content: "module top_tb_2; endmodule" },
    { name: "nested/top_tb_3.sv", content: "" },
  ];
  assert.deepEqual(uniqueTestbenchName("top", files), { fileName: "top_tb_4.sv", moduleName: "top_tb_4" });
  const design = designFor("module top(input dut, dut_instance, output done); endmodule");
  const artifact = createTestbenchScaffold(design, defaultTestbenchConfiguration(design), files, "Board");
  assert.match(artifact.content, /module top_tb_4;/);
  assert.match(artifact.content, /top dut_instance_instance \(/);
  assert.match(artifact.content, /\$dumpvars\(0, top_tb_4\)/);
});

test("portless default projects work while unsupported interfaces and VHDL stay explicit", () => {
  const design = designFor("// Empty project\nmodule top;\nendmodule");
  assert.deepEqual(design.signals, []);
  assert.match(createTestbenchScaffold(design, defaultTestbenchConfiguration(design), [], "Board").content, /top dut \(\n\n  \);/);
  assert.match(inspectTestbenchSource({ name: "top.vhd", content: "entity top is end;" }).error, /VHDL is not supported/);
  assert.match(inspectTestbenchSource(null).error, /Select a Verilog/);
  for (const source of [
    "module top(input [UNKNOWN:0] data); endmodule",
    "module top(input [2:0][1:0] data); endmodule",
    "module top(input custom_t data); endmodule",
    "`define WIDTH 8\nmodule top(input [`WIDTH-1:0] data); endmodule",
  ]) assert.ok(inspectTestbenchSource({ name: "top.sv", content: source }).designs[0].error, source);
  const multi = inspectTestbenchSource({ name: "top.sv", content: "module helper(); endmodule\nmodule top(input clk); endmodule" });
  assert.deepEqual(multi.designs.map(item => item.moduleName), ["helper", "top"]);
});

const nativeTools = ["iverilog", "vvp"].every(command => !spawnSync(command, ["-V"], { encoding: "utf8" }).error);
test("generated sequential, combinational and portless benches compile and run in Icarus", { skip: !nativeTools }, () => {
  // Keep scratch output within the lane's bound worktree, and always remove it.
  const directory = mkdtempSync(resolve(import.meta.dirname, ".testbench-scaffold-"));
  try {
    const fixtures = [
      {
        source: `module top(input core_clk, reset_n, input [5:3] data, output [8:9] leds, output [4:4] ready, input dut);
          assign leds = data[4:3]; assign ready = reset_n;
          always @(posedge core_clk) if ($time < 31 && reset_n !== 1'b0) $fatal(1, "reset released too early");
          always @(posedge reset_n) if (core_clk !== 1'b0) $fatal(1, "reset release raced active clock edge");
          initial begin #31; if (reset_n !== 1'b1) $fatal(1, "reset not released"); end
          endmodule`,
        configuration: { clockSignal: "core_clk", resetSignal: "reset_n", resetPolarity: "low" },
      },
      { source: "module top(input a, output z); assign z = a; endmodule", configuration: { clockSignal: "", resetSignal: "" } },
      { source: "module top; endmodule", configuration: {} },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      const source = `\`timescale 1ns / 1ps\n${fixture.source}`;
      const design = designFor(source);
      const configuration = { ...defaultTestbenchConfiguration(design), ...fixture.configuration };
      const artifact = createTestbenchScaffold(design, configuration, [], "Test Board");
      writeFileSync(resolve(directory, "top.sv"), source);
      writeFileSync(resolve(directory, artifact.fileName), artifact.content);
      const output = `run-${index}`;
      const compiled = spawnSync("iverilog", ["-g2012", "-s", artifact.moduleName, "-o", output, "top.sv", artifact.fileName], { cwd: directory, encoding: "utf8", timeout: 15_000 });
      assert.equal(compiled.status, 0, compiled.stderr || compiled.error?.message);
      const run = spawnSync("vvp", [output], { cwd: directory, encoding: "utf8", timeout: 15_000 });
      assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
      assert.doesNotMatch(run.stdout, /FATAL|ERROR/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
