import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
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

const { getPinBuses, getBulkPinGroups, previewBulkPinAssignment, createPinAssignmentHistory, pinAssignmentReducer, PIN_ASSIGNMENT_HISTORY_LIMIT } = load("../src/lib/pinAssignment.ts");
const { findPorts, createPinMappingConstraints, readPinMappingsFromConstraints } = load("../src/pages/dashboard/pinMappingUtils.ts");
const pin = (name, pad, type = "gpio", extra = {}) => ({ name, pin: pad, type, group: "Header", verified: true, ioStandard: "LVCMOS33", ...extra });
const key = (name, pad) => `pin:${name}:${pad}`;
function fixtureBoard(format = "pcf") {
  return {
    id: "bulk-fixture", name: "Bulk fixture", constraintsFile: format,
    clocks: [{ name: "sys_clk", pin: "C1", frequency: 12000000, verified: true, ioStandard: "LVCMOS33" }, { name: "ref", pin: "R1", differentialPin: "R2", role: "reference", frequency: 100000000, verified: true }],
    pins: [pin("third", "P3"), pin("first", "P1"), pin("first_alias", "P1"), pin("second", "P2"), pin("fourth", "P4"), pin("unverified", "U1", "gpio", { verified: false }), pin("config", "F1", "flash"), pin("flash_alias", "F1"), pin("ref_alias", "R1"), pin("ref_n_alias", "R2"), pin("led", "L1", "led"), pin("button", "B1", "button"), pin("tx", "T1", "uart")],
    leds: [], buttons: [],
  };
}
const busPorts = () => findPorts([{ name: "top.sv", content: "module top(output [5:3] data, input flag); endmodule" }]);
const choice = (overrides = {}) => ({ busName: "data", groupTitle: "Header", start: 0, reverse: false, ...overrides });

test("bus metadata preserves declared Verilog order, nonzero bounds and one-bit vectors", () => {
  const ports = findPorts([{ name: "top.sv", content: "module top(output [0:2] ascending, output [15:13] upper, output [4:4] single); endmodule" }]);
  assert.deepEqual(getPinBuses(ports).map((bus) => bus.ports.map((port) => port.name)), [["ascending[0]", "ascending[1]", "ascending[2]"], ["upper[15]", "upper[14]", "upper[13]"], ["single[4]"]]);
});

test("VHDL vectors retain exact to/downto indices and normalized directions", () => {
  const ports = findPorts([{ name: "top.vhd", content: `entity top is port (clk : in std_logic; data, other : out std_logic_vector(8 downto 6); ascending : in std_logic_vector(2 to 4); single : inout std_logic_vector(4 downto 4)); end entity;` }]);
  assert.deepEqual(ports.map((port) => port.name), ["clk", "data[8]", "data[7]", "data[6]", "other[8]", "other[7]", "other[6]", "ascending[2]", "ascending[3]", "ascending[4]", "single[4]"]);
  assert.deepEqual(getPinBuses(ports).map((bus) => bus.direction), ["output", "output", "input", "inout"]);
});

test("unresolved, multidimensional and oversized ranges never become guessed scalar ports", () => {
  assert.deepEqual(findPorts([{ name: "top.sv", content: "module top(output [WIDTH-1:0] unresolved, output [2:0][1:0] packed, input unpacked[3:0], output [5000:0] huge, output done); endmodule" }]).map((port) => port.name), ["done"]);
  assert.deepEqual(findPorts([{ name: "top.vhd", content: "entity top is port (data : out std_logic_vector(WIDTH-1 downto 0); null_range : in std_logic_vector(0 downto 7); done : out std_logic); end entity;" }]).map((port) => port.name), ["done"]);
});

test("bulk resource selection deduplicates aliases and excludes unverified, reserved and incompatible pads", () => {
  const board = fixtureBoard();
  const outputs = getBulkPinGroups(board, "output");
  assert.deepEqual(outputs.find((group) => group.title === "Header").pins.map((item) => item.pin), ["P3", "P1", "P2", "P4"]);
  assert.ok(outputs.some((group) => group.title === "LEDs"));
  assert.ok(!outputs.some((group) => group.title === "Buttons / Reset" || group.title === "Clocks"));
  const inputs = getBulkPinGroups(board, "input");
  assert.ok(inputs.some((group) => group.title === "Buttons / Reset"));
  assert.ok(inputs.some((group) => group.title === "Clocks"));
  assert.ok(!inputs.some((group) => group.title === "LEDs"));
  assert.deepEqual(getBulkPinGroups(board, "inout").flatMap((group) => group.pins).map((item) => item.pin), ["P3", "P1", "P2", "P4"]);
});

test("preview remaps a partial bus atomically and preserves assignments outside the bus", () => {
  const current = { "data[5]": key("first", "P1"), "data[4]": "", "data[3]": key("third", "P3"), flag: key("fourth", "P4") };
  const before = structuredClone(current);
  const preview = previewBulkPinAssignment(fixtureBoard(), busPorts(), current, choice());
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.rows.map((row) => [row.portName, row.previousKey, row.nextKey]), [["data[5]", key("first", "P1"), key("third", "P3")], ["data[4]", "", key("first", "P1")], ["data[3]", key("third", "P3"), key("second", "P2")]]);
  assert.equal(preview.nextMappings.flag, current.flag);
  assert.deepEqual(current, before);
});

test("reversal flips only the chosen resource sequence, never the HDL indices", () => {
  const current = { flag: "" };
  const preview = previewBulkPinAssignment(fixtureBoard(), busPorts(), current, choice({ start: 1, reverse: true }));
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.rows.map((row) => [row.portName, row.nextKey]), [["data[5]", key("fourth", "P4")], ["data[4]", key("second", "P2")], ["data[3]", key("first", "P1")]]);
});

test("an outside-bus assignment blocks Apply by physical pad even through another alias", () => {
  const current = { "data[5]": key("third", "P3"), flag: key("first_alias", "P1") };
  const preview = previewBulkPinAssignment(fixtureBoard(), busPorts(), current, choice());
  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.rows[1].conflicts, ["flag"]);
  assert.match(preview.errors.join(" "), /P1 is already used by flag/);
  assert.equal(preview.nextMappings.flag, current.flag);
});

test("invalid choices and insufficient resources block the whole batch without mutating drafts", () => {
  const current = { flag: "" };
  for (const invalid of [choice({ start: 2 }), choice({ start: -1 }), choice({ start: 0.5 }), choice({ groupTitle: "missing" }), choice({ busName: "missing" }), choice({ groupTitle: "LEDs" })]) {
    const preview = previewBulkPinAssignment(fixtureBoard(), busPorts(), current, invalid);
    assert.equal(preview.canApply, false);
    assert.ok(preview.errors.length);
    assert.deepEqual(current, { flag: "" });
  }
});

test("bulk application retains existing LPF/XDC electrical-standard validation", () => {
  for (const format of ["lpf", "xdc"]) {
    const board = fixtureBoard(format);
    board.pins.find((item) => item.name === "second").ioStandard = undefined;
    const preview = previewBulkPinAssignment(board, busPorts(), {}, choice());
    assert.equal(preview.canApply, false);
    assert.match(preview.errors.join(" "), /data\[3\].*no documented I\/O standard/);
  }
});

test("one batch is one undo/redo step, including explicit clears of suggested assignments", () => {
  const initial = { "data[5]": key("first", "P1"), "data[4]": "", "data[3]": key("third", "P3"), flag: "" };
  let state = createPinAssignmentHistory(initial);
  const batch = previewBulkPinAssignment(fixtureBoard(), busPorts(), state.present, choice()).nextMappings;
  state = pinAssignmentReducer(state, { type: "commit", mappings: batch });
  assert.equal(state.past.length, 1);
  state = pinAssignmentReducer(state, { type: "undo" });
  assert.deepEqual(state.present, initial);
  state = pinAssignmentReducer(state, { type: "redo" });
  assert.deepEqual(state.present, batch);
  state = pinAssignmentReducer(state, { type: "commit", mappings: { ...state.present, "data[5]": "" } });
  assert.equal(state.present["data[5]"], "");
  state = pinAssignmentReducer(state, { type: "undo" });
  assert.deepEqual(state.present, batch);
});

test("history ignores no-ops, clears redo after a new edit, resets at a new baseline and is bounded", () => {
  let state = createPinAssignmentHistory({ bit: "a" });
  assert.equal(pinAssignmentReducer(state, { type: "commit", mappings: { bit: "a" } }), state);
  state = pinAssignmentReducer(state, { type: "commit", mappings: { bit: "b" } });
  state = pinAssignmentReducer(state, { type: "undo" });
  state = pinAssignmentReducer(state, { type: "commit", mappings: { bit: "c" } });
  assert.equal(state.future.length, 0);
  for (let index = 0; index < 80; index++) state = pinAssignmentReducer(state, { type: "commit", mappings: { bit: String(index) } });
  assert.equal(state.past.length, PIN_ASSIGNMENT_HISTORY_LIMIT);
  state = pinAssignmentReducer(state, { type: "reset", mappings: { replacement: "saved" } });
  assert.deepEqual(state, { past: [], present: { replacement: "saved" }, future: [] });
});

test("saved bulk mappings round-trip exact ascending/nonzero indices through constraint export", () => {
  const ports = findPorts([{ name: "top.sv", content: "module top(output [8:10] data); endmodule" }]);
  for (const format of ["pcf", "lpf", "xdc", "qsf"]) {
    const board = fixtureBoard(format);
    const preview = previewBulkPinAssignment(board, ports, {}, choice());
    const content = createPinMappingConstraints(board, ports, preview.nextMappings);
    assert.deepEqual(readPinMappingsFromConstraints(board, ports, content), preview.nextMappings);
  }
});
