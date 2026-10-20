import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(relativePath) {
  const file = resolve(import.meta.dirname, relativePath);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
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
const { parseImportSources, expandOutputDeclaration, mergeOutputDeclarations } = load("../src/lib/portImport.ts");
function parse(content, name = "top.sv") { return parseImportSources([{ name, content }]); }
function outputNames(unit) { return unit.outputs.flatMap(expandOutputDeclaration).map((port) => port.name); }

test("imports only the selected module outputs, preserving ranges and shared declarations", () => {
  const units = parse(`module child(output ignored); endmodule
    module top(input clk, output logic [15:8] data, extra, output done, output [0:2] ascending, output [4:4] single, inout bus); endmodule`);
  assert.equal(units.length, 2);
  assert.equal(units[1].error, undefined);
  assert.deepEqual(outputNames(units[1]), ["data[15]", "data[14]", "data[13]", "data[12]", "data[11]", "data[10]", "data[9]", "data[8]", "extra[15]", "extra[14]", "extra[13]", "extra[12]", "extra[11]", "extra[10]", "extra[9]", "extra[8]", "done", "ascending[0]", "ascending[1]", "ascending[2]", "single[4]"]);
});
test("resolves integer parameter defaults without executing expressions", () => {
  const [unit] = parse("module top #(parameter integer WIDTH = 4, parameter END = WIDTH * 2 - 1)(output [END:WIDTH] data); endmodule");
  assert.deepEqual(outputNames(unit), ["data[7]", "data[6]", "data[5]", "data[4]"]);
  for (const range of ["MISSING-1:0", "$clog2(8):0", "4096:0", "1/0:0"]) {
    assert.match(parse(`module top(output [${range}] data); endmodule`)[0].error, /./);
  }
});
test("non-ANSI declarations exclude function/task ports and honor header membership", () => {
  const [unit] = parse(`module top(clk, data, done); input clk; output [7:5] data; output done;
    function f; output unrelated; endfunction endmodule`);
  assert.deepEqual(outputNames(unit), ["data[7]", "data[6]", "data[5]", "done"]);
  assert.match(parse("module top(a); output b; endmodule")[0].error, /port list/);
});
test("VHDL entities preserve grouped ports, generics, directions and vector indices", () => {
  const units = parse(`-- entity fake is port(x: out bit); end;
    entity top is generic (WIDTH: positive := 3); port(clk: in std_logic; a,b: out std_logic_vector(WIDTH+4 downto 5); c: out bit_vector(1 to 2); z: out bit); end entity top;
    entity other is port(q: out bit); end other;`, "top.vhd");
  assert.equal(units.length, 2);
  assert.equal(units[0].error, undefined);
  assert.deepEqual(outputNames(units[0]), ["a[7]", "a[6]", "a[5]", "b[7]", "b[6]", "b[5]", "c[1]", "c[2]", "z"]);
});
test("unsupported interface declarations fail the whole selected top instead of partially importing", () => {
  for (const source of [
    "module top(output good, output [3:0][1:0] multi); endmodule",
    "module top(output good, output data [3:0]); endmodule",
    "module top(output integer number); endmodule",
    "`define WIDTH 8\nmodule top(output [`WIDTH-1:0] data); endmodule",
    "module top(output custom_t data); endmodule",
    "module top(output repeated, output repeated); endmodule",
  ]) {
    const [unit] = parse(source);
    assert.ok(unit.error, source); assert.deepEqual(unit.outputs, []);
  }
  assert.ok(parse("entity top is port(good: out bit; bad: out custom_type); end;", "top.vhd")[0].error);
  assert.throws(() => parse("not a module"), /No complete/);
  assert.throws(() => parse("x".repeat(2 * 1024 * 1024 + 1)), /2 MiB/);
});
test("merge keeps existing declarations and assignments usable without renumbering", () => {
  const existing = [{ name: "data", width: 1 }];
  const [unit] = parse("module top(output [8:5] data, output fresh); endmodule");
  const result = mergeOutputDeclarations(existing, unit.outputs);
  assert.deepEqual(result.declarations, [...existing, { name: "fresh", width: 1 }]);
  assert.equal(result.skipped, 1);
  assert.deepEqual(expandOutputDeclaration({name: "manual", width: 2}).map((port) => port.name), ["manual[1]", "manual[0]"]);
});

test("imported range bits reach the existing board-specific constraint writer intact", () => {
  const { createPinMappingConstraints } = load("../src/pages/dashboard/pinMappingUtils.ts");
  const { REAL_BOARDS } = load("../src/data/boards.ts");
  const ports = parse("module top(output [9:8] status); endmodule")[0].outputs.flatMap(expandOutputDeclaration);
  const board = { ...REAL_BOARDS[0], constraintsFile: "xdc", clocks: [], pins: [{ name: "a", pin: "P1", verified: true, type: "gpio", ioStandard: "LVCMOS33" }, { name: "b", pin: "P2", verified: true, type: "gpio", ioStandard: "LVCMOS33" }] };
  const text = createPinMappingConstraints(board, ports, { "status[9]": "pin:a:P1", "status[8]": "pin:b:P2" });
  assert.match(text, /PACKAGE_PIN P1 \[get_ports \{status\[9\]\}\]/);
  assert.match(text, /PACKAGE_PIN P2 \[get_ports \{status\[8\]\}\]/);
});
