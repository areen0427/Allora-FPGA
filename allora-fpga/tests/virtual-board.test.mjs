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
    if (name === "./tauri") return { invokeTauri: () => { throw new Error("Native call in pure resource test"); } };
    if (name === "../hooks/utils") return {};
    if (!name.startsWith(".")) return require(name);
    const base = resolve(dirname(file), name);
    const target = [`${base}.ts`, `${base}.tsx`, base].find(existsSync);
    if (!target) throw new Error(`Cannot load ${name}`);
    return load(target);
  }, exports);
  return exports;
}

const { REAL_BOARDS, VIRTUAL_BOARD, getBoardById } = load("../src/data/boards.ts");
const { getVirtualBoardResources } = load("../src/lib/virtualBoardResources.ts");
const { defaultVirtualFpgaConfig, readVirtualFpgaConfig, writeVirtualFpgaConfig, isPeripheralActive, getPeripheralDriveValue } = load("../src/lib/virtualFpga.ts");
const count = (board, type) => getVirtualBoardResources(board).peripherals.filter(item => item.type === type).length;

test("real catalog boards supply their own controls and oscillator", () => {
  const arty = getBoardById("arty-a7-35t");
  assert.ok(arty);
  assert.equal(count(arty, "led"), 16);
  assert.equal(count(arty, "button"), 4);
  assert.equal(count(arty, "switch"), 4);
  assert.equal(count(arty, "reset"), 1);
  assert.equal(defaultVirtualFpgaConfig("top", arty).clockFrequencyHz, 100_000_000);
  const tiny = getBoardById("tinyfpga-bx");
  assert.equal(count(tiny, "led"), 1);
  assert.equal(count(tiny, "button"), 0);
  assert.equal(count(tiny, "switch"), 0);
  assert.equal(count(tiny, "reset"), 0);
  assert.equal(defaultVirtualFpgaConfig("top", tiny).clockFrequencyHz, 16_000_000);
  assert.ok(getVirtualBoardResources(tiny).resources.some(item => /flash/i.test(item.label)));
  const resources = getVirtualBoardResources(arty).resources;
  assert.ok(resources.every(item => item.label.length <= 80 && !/^NOTE:/i.test(item.label)));
  assert.ok(resources.some(item => /NOTE:/i.test(item.detail ?? "")));
});

test("catalog resets, RGB channels and active low buttons retain board metadata", () => {
  const crab = getVirtualBoardResources(getBoardById("orangecrab-r02-25f"));
  assert.equal(crab.peripherals.filter(item => item.type === "reset").length, 1);
  assert.equal(crab.peripherals.find(item => item.type === "reset").activeHigh, false);
  assert.deepEqual(new Set(crab.peripherals.filter(item => item.type === "led").map(item => item.color)), new Set(["red", "green", "blue"]));
  const ulx = getVirtualBoardResources(getBoardById("ulx3s-85f"));
  assert.equal(ulx.peripherals.find(item => item.label === "btn0").activeHigh, false);
  assert.equal(ulx.peripherals.filter(item => item.type === "button").length, 7);
});

test("every catalog board deduplicates aliases, excludes unverified controls and distinguishes labels", () => {
  for (const board of REAL_BOARDS) {
    const { peripherals } = getVirtualBoardResources(board);
    const controls = peripherals.filter(item => item.type !== "clock");
    assert.equal(new Set(controls.map(item => item.pad)).size, controls.length, board.id);
    assert.equal(new Set(peripherals.map(item => item.id)).size, peripherals.length, board.id);
    assert.equal(new Set(controls.map(item => item.label)).size, controls.length, board.id);
    for (const item of controls) assert.ok([...board.leds, ...board.buttons, ...board.pins].some(pin => pin.pin === item.pad && pin.verified));
  }
});

test("legacy mappings migrate only to existing controls, then round-trip by board and pad", () => {
  const arty = getBoardById("arty-a7-35t");
  const legacy = defaultVirtualFpgaConfig("legacy_top");
  legacy.peripherals.find(item => item.id === "led-0").signal = "result";
  legacy.peripherals.find(item => item.id === "led-0").bit = 3;
  legacy.peripherals.find(item => item.id === "switch-0").signal = "enable";
  const files = [{ name: "allora-project.json", content: writeVirtualFpgaConfig("{}", legacy) }];
  const migrated = readVirtualFpgaConfig(files, "top", arty);
  assert.equal(migrated.boardId, arty.id);
  assert.equal(migrated.peripherals.filter(item => item.type === "led")[0].signal, "result");
  assert.equal(migrated.peripherals.filter(item => item.type === "led")[0].bit, 3);
  assert.equal(migrated.peripherals.filter(item => item.type === "switch")[0].signal, "enable");
  assert.equal(migrated.peripherals.filter(item => item.type === "reset").length, 1);
  const saved = [{ name: "allora-project.json", content: writeVirtualFpgaConfig("{}", migrated) }];
  assert.deepEqual(readVirtualFpgaConfig(saved, "top", arty), migrated);
  assert.deepEqual(readVirtualFpgaConfig(saved, "top"), migrated);
  const changedBoard = readVirtualFpgaConfig(saved, "top", getBoardById("tinyfpga-bx"));
  assert.ok(changedBoard.peripherals.every(item => item.signal === null));
  assert.equal(changedBoard.clockFrequencyHz, 16_000_000);
});

test("new physical projects use the board clock, including fractional MHz values", () => {
  const board = { ...getBoardById("tinyfpga-bx"), clocks: [{ name: "clk", frequency: 12_288_000, verified: true }] };
  assert.equal(readVirtualFpgaConfig([], "top", board).clockFrequencyHz, 12_288_000);
  const config = defaultVirtualFpgaConfig("top", board);
  config.clockFrequencyHz = 1_000_000;
  assert.equal(readVirtualFpgaConfig([{ name: "allora-project.json", content: writeVirtualFpgaConfig("{}", config) }], "top", board).clockFrequencyHz, 1_000_000);
});

test("board-free projects retain their existing configurable virtual controls", () => {
  assert.deepEqual(defaultVirtualFpgaConfig("top", VIRTUAL_BOARD), defaultVirtualFpgaConfig("top"));
  assert.equal(defaultVirtualFpgaConfig("top").peripherals.filter(item => item.type === "led").length, 8);
});

test("logical LED/switch state and pressed/released drive honor electrical polarity", () => {
  const low = { id: "low", type: "button", label: "BTN", signal: "buttons", bit: 2, activeHigh: false };
  const high = { ...low, activeHigh: true };
  assert.equal(isPeripheralActive(low, { simTimePs: 0, values: { buttons: "0" } }), true);
  assert.equal(isPeripheralActive(low, { simTimePs: 0, values: { buttons: "4" } }), false);
  assert.equal(isPeripheralActive(high, { simTimePs: 0, values: { buttons: "4" } }), true);
  assert.equal(isPeripheralActive(low, null), false);
  assert.equal(getPeripheralDriveValue(low, true), 0);
  assert.equal(getPeripheralDriveValue(low, false), 1);
  assert.equal(getPeripheralDriveValue(high, true), 1);
  assert.equal(getPeripheralDriveValue(high, false), 0);
});
