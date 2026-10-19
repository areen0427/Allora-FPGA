import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
const cache = new Map();
function load(file) {
  file = resolve(import.meta.dirname, file);
  if (cache.has(file)) return cache.get(file);
  const out = {}; cache.set(file, out);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", code)(name => {
    const target = resolve(dirname(file), name);
    return load(existsSync(target) ? target : `${target}.ts`);
  }, out);
  return out;
}
const { REAL_BOARDS, VIRTUAL_BOARD, getBoardById } = load("../src/data/boards.ts");
const { getBoardCapabilities } = load("../src/data/boardCapabilities.ts");

test("all published boards have unique aliases and source provenance without granting new flows", () => {
  assert.equal(REAL_BOARDS.length, 255);
  for (const board of REAL_BOARDS) {
    assert.equal(new Set(board.pins.map(pin => pin.name)).size, board.pins.length, board.id);
    assert.ok(board.sources?.length, `${board.id} needs a traceable source`);
    assert.deepEqual(new Set(board.leds.map(pin => pin.pin)).size, board.leds.length, `${board.id}: duplicate LED channel`);
    if (board.synthesisFlow !== "yosys-nextpnr") assert.equal(getBoardCapabilities(board).bitstream.supported, false, board.id);
  }
  assert.equal(REAL_BOARDS.filter(board => getBoardCapabilities(board).bitstream.supported).length, 55);
  assert.equal(VIRTUAL_BOARD.pins.length, 0);
  const north = getBoardById("xilinx-kc705").pins.find(pin => pin.name === "user_btn_n_0");
  assert.equal(north.pin, "AA12");
  assert.equal(north.activeLow, undefined, "north is a direction, not an active-low polarity declaration");
});

test("catalog data is small enough for the native MCP board catalog bound", () => {
  const payload = [...REAL_BOARDS, VIRTUAL_BOARD].map(board => ({ ...board, capabilities: getBoardCapabilities(board) }));
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 8 * 1024 * 1024, "native catalog reader rejects files over 8 MiB");
});

test("source default clocks stay paired with their own pads and differential partners", () => {
  const sitlinv = getBoardById("sitlinv-stlv7325-v1");
  assert.equal(sitlinv.clocks[0].name, "clk200");
  assert.equal(sitlinv.clocks[0].frequency, 200_000_000);
  assert.equal(sitlinv.clocks[0].pin, "AB11");
  assert.equal(sitlinv.clocks[0].differentialPin, "AC11");
  const alhambra = getBoardById("fpgawars-alhambra2");
  assert.equal(alhambra.leds.length, 8);
  assert.equal(alhambra.clocks[0].pin, "49");
  const fomu = getBoardById("kosagi-fomu-hacker");
  assert.equal(fomu.clocks[0].pin, "F5");
  assert.equal(fomu.clocks[0].frequency, 48_000_000);
  assert.equal(getBoardById("qwertyembedded-beaglewire").clocks[0].pin, "61");
});

test("restricted upstream reader ignores internal width placeholders and distinguishes OLED from LED", () => {
  const scratch = resolve(import.meta.dirname, "../node_modules/.tmp");
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(resolve(scratch, "board-import-test-"));
  try {
    const fixture = resolve(directory, "fixture.py");
    writeFileSync(fixture, `_io = [\n ("clk100", 0, Pins("F17")),\n ("clk200", 0, Subsignal("p", Pins("AB11")), Subsignal("n", Pins("AC11"))),\n ("user_led", 0, Pins("A1")),\n ("oled_spi", 0, Subsignal("clk", Pins("A2"))),\n ("O_sdram_clk", 0, Pins(1)),\n]\nclass Platform:\n default_clk_name = "clk200"\n default_clk_period = 1e9/200e6\n`);
    const code = `import importlib.util,json,pathlib,sys\ns=importlib.util.spec_from_file_location('reader',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps(m.Reader(pathlib.Path(sys.argv[2])).snapshot()))`;
    const data = JSON.parse(execFileSync("python3", ["-B", "-c", code, resolve(import.meta.dirname, "../scripts/import-board-platforms.py"), fixture], { encoding: "utf8" }));
    assert.ok(!data.pins.some(pin => pin.pin === "1"));
    assert.equal(data.pins.find(pin => pin.name === "oled_spi_0_clk").type, "gpio");
    assert.equal(data.pins.filter(pin => pin.type === "led").length, 1);
    assert.ok(data.pins.every(pin => pin.activeLow === undefined), "signal spelling cannot prove polarity");
    assert.deepEqual([data.clock.frequency, data.clock.pin, data.clock.differentialPin], [200_000_000, "AB11", "AC11"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("build preflight blocks missing LPF bank standards instead of assuming 3.3 V", () => {
  const { getBuildPreflight } = load("../src/lib/buildPreflight.ts");
  const board = {
    ...getBoardById("ulx3s-85f"),
    clocks: [],
    leds: [],
    buttons: [],
    pins: [{ name: "gpio", pin: "B2", type: "gpio", signal: "gpio", verified: true }],
  };
  const input = { board, files: [{ name: "top.v", content: "module top(output gpio); assign gpio = 1'b0; endmodule" }], topLevelFileName: "top.v", nativeAvailable: true, yosysAvailable: true };
  const missing = getBuildPreflight(input).find(check => check.id === "pins");
  assert.equal(missing.state, "blocked");
  assert.match(missing.detail, /no verified IO standard/);
  board.pins[0].ioStandard = "LVCMOS18";
  assert.equal(getBuildPreflight(input).find(check => check.id === "pins").state, "ready");
});
