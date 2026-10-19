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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    if (!name.startsWith(".")) return require(name);
    const base = resolve(dirname(file), name);
    const target = [base, `${base}.ts`].find(existsSync);
    if (!target) throw new Error(`Cannot load ${name} from ${file}`);
    return load(target);
  }, exports);
  return exports;
}

const { ac701 } = load("../src/data/boards/ac701.ts");
const { ARTY_A7_BOARDS } = load("../src/data/boards/artya7.ts");
const { ecpix5Boards, icesugarPro, tangNanoBoards } = load(
  "../src/data/boards/litexDerived.ts",
);
const {
  latticeVersaEcp5,
  latticeEcp5Evn,
  trellisBoard,
  kosagiNetV2Boards,
  sqrlFk33,
} = load("../src/data/boards/litexAdditional.ts");
const { ULX3S_BOARDS } = load("../src/data/boards/ulx3s.ts");
const { fomuPvt } = load("../src/data/boards/fomu.ts");
const { icebreaker } = load("../src/data/boards/icebreaker.ts");

// Values below are independent manufacturer schematic/constraint anchors;
// these catch dangerous catalog regressions rather than re-testing a parser.
test("Arty A7 manufacturer Rev D/E maps both densities, four user buttons and CPU reset", () => {
  for (const board of ARTY_A7_BOARDS) {
    assert.equal(board.pins.length, 161);
    assert.equal(board.leds.length, 16);
    assert.equal(board.buttons.length, 5);
    assert.deepEqual(
      new Set(board.buttons.map((pin) => pin.pin)),
      new Set(["D9", "C9", "B9", "B8", "C2"]),
    );
    assert.equal(board.clocks[0].frequency, 100_000_000);
    assert.equal(board.clocks[0].pin, "E3");
    assert.ok(
      board.pins.some((pin) => pin.pin === "G13" && pin.group.includes("JA")),
    );
  }
});

test("ECPIX-5 R02 has four active-low RGB packages, a 26 MHz oscillator and a dedicated SERDES reference", () => {
  for (const board of ecpix5Boards) {
    assert.equal(board.leds.length, 12);
    assert.ok(board.leds.every((pin) => pin.activeLow === true));
    assert.ok(board.leds.some((pin) => pin.pin === "U21"));
    assert.ok(board.leds.some((pin) => pin.pin === "T22"));
    assert.ok(
      board.clocks.some(
        (clock) => clock.pin === "N22" && clock.frequency === 26_000_000,
      ),
    );
    assert.ok(
      board.clocks.some(
        (clock) =>
          clock.pin === "AF12" &&
          clock.differentialPin === "AF13" &&
          clock.role === "reference",
      ),
    );
    assert.equal(board.clocks[0].pin, "K23");
  }
});

test("iCESugar Pro maker schematic overrides misleading active-low source aliases", () => {
  assert.equal(icesugarPro.device, "LFE5U-25F");
  assert.deepEqual(
    new Set(icesugarPro.leds.map((pin) => pin.pin)),
    new Set(["B11", "A11", "A12"]),
  );
  assert.ok(icesugarPro.leds.every((pin) => pin.activeLow === false));
});

test("ULX3S v2/v3 exposes eight LEDs, seven buttons, four switches and GPIO OLED controls", () => {
  for (const board of ULX3S_BOARDS) {
    assert.equal(board.leds.length, 8);
    assert.equal(board.buttons.length, 7);
    assert.equal(board.buttons.find((pin) => pin.pin === "D6").activeLow, true);
    assert.equal(
      board.pins.filter((pin) => pin.group === "Switches").length,
      4,
    );
    assert.ok(
      board.pins.some(
        (pin) =>
          pin.pin === "P4" && pin.name.startsWith("oled") && pin.type !== "led",
      ),
    );
  }
});

test("display segments and DIP switches are peripheral resources, not extra user LEDs/buttons", () => {
  assert.equal(latticeVersaEcp5.leds.length, 8);
  assert.equal(latticeVersaEcp5.buttons.length, 1);
  assert.equal(
    latticeVersaEcp5.pins.filter((pin) => pin.group === "Alphanumeric display")
      .length,
    15,
  );
  assert.equal(
    latticeVersaEcp5.pins.filter((pin) => pin.group === "Switches").length,
    8,
  );
  assert.equal(latticeEcp5Evn.buttons.length, 1);
  assert.equal(
    latticeEcp5Evn.pins.filter((pin) => pin.group === "Switches").length,
    8,
  );
  assert.equal(fomuPvt.buttons.length, 0);
  assert.equal(
    fomuPvt.pins.filter((pin) => pin.group === "Touch pads").length,
    4,
  );
});

test("TrellisBoard uses actual B3 oscillator and twelve LEDs, excludes broken rev1.0 clock", () => {
  assert.equal(trellisBoard.clocks[0].pin, "B3");
  assert.equal(trellisBoard.clocks[0].frequency, 12_000_000);
  assert.ok(!trellisBoard.clocks.some((clock) => clock.name === "clk100"));
  assert.equal(
    trellisBoard.pins.find((pin) => pin.pin === "B29" && pin.type === "clock")
      .verified,
    false,
  );
  assert.equal(trellisBoard.leds.length, 12);
  assert.equal(trellisBoard.buttons.length, 4);
  assert.equal(
    trellisBoard.leds.find((pin) => pin.name === "user_led_0").pin,
    "C26",
  );
});

test("AC701 vendor electrical standards and FPGA UART direction survive source enrichment", () => {
  assert.equal(ac701.clocks[0].frequency, 200_000_000);
  assert.equal(ac701.clocks[0].pin, "R3");
  assert.equal(ac701.clocks[0].differentialPin, "P3");
  assert.equal(ac701.clocks[0].ioStandard, "LVDS_25");
  assert.ok(
    ac701.clocks.some(
      (clock) => clock.pin === "M21" && clock.frequency === 156_250_000,
    ),
  );
  assert.equal(
    ac701.buttons.find((pin) => pin.name === "north").activeLow,
    false,
  );
  assert.equal(ac701.pins.find((pin) => pin.signal === "uart_tx").pin, "U19");
  assert.equal(ac701.pins.find((pin) => pin.signal === "uart_rx").pin, "T19");
  assert.equal(
    ac701.pins.find((pin) => pin.signal === "uart_tx").ioStandard,
    "LVCMOS18",
  );
});

test("other corrected source anchors include NetV2 UART, FK33 differential clock and Tang internal-memory placeholders", () => {
  for (const board of kosagiNetV2Boards) {
    assert.equal(board.clocks[0].pin, "J19");
    assert.equal(board.pins.find((pin) => pin.signal === "uart_tx").pin, "E14");
    assert.equal(board.pins.find((pin) => pin.signal === "uart_rx").pin, "E13");
    assert.equal(board.leds.length, 6);
  }
  assert.equal(sqrlFk33.clocks[0].pin, "BC26");
  assert.equal(sqrlFk33.clocks[0].differentialPin, "BC27");
  assert.equal(sqrlFk33.leds.length, 7);
  assert.ok(
    !tangNanoBoards[1].pins.some(
      (pin) =>
        pin.name.startsWith("O_sdram") || pin.name.startsWith("IO_sdram"),
    ),
  );
  assert.ok(
    tangNanoBoards[0].leds.every((pin) => pin.ioStandard === "LVCMOS18"),
  );
  assert.equal(icebreaker.buttons.length, 4);
  assert.ok(
    icebreaker.pins.some(
      (pin) => pin.name === "breakoff_led1" && pin.pin === "26",
    ),
  );
});
