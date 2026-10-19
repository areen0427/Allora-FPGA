import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const cache = new Map();
function load(relativePath) {
  const path = resolve(
    fileURLToPath(new URL("..", import.meta.url)),
    relativePath,
  );
  if (cache.has(path)) return cache.get(path);
  const output = {};
  cache.set(path, output);
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    assert.ok(name.startsWith("."), `Unexpected dependency ${name}`);
    const resolved = resolve(dirname(path), name);
    return load(existsSync(resolved) ? resolved : `${resolved}.ts`);
  }, output);
  return output;
}

const { FPGAS, getFpgaById, getFpgaForBoard } = load("src/data/fpgas.ts");
const { REAL_BOARDS, VIRTUAL_BOARD } = load("src/data/boards.ts");
const { getBoardCapabilities } = load("src/data/boardCapabilities.ts");

test("resource profiles retain architecture units, primary provenance and consistent RAM totals", () => {
  assert.equal(new Set(FPGAS.map((profile) => profile.id)).size, FPGAS.length);
  for (const profile of FPGAS) {
    assert.equal(profile.verified, true, profile.device);
    assert.ok(profile.logicUnit, profile.device);
    assert.ok(profile.sources.length, profile.device);
    for (const reference of profile.sources) {
      assert.match(reference.url, /^https:\/\//);
      assert.match(reference.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(reference.title);
      assert.ok(reference.section);
    }
    if (profile.dsp !== undefined) assert.ok(profile.dspUnit, profile.device);
    if (profile.blockRamBlocks !== undefined) {
      assert.equal(
        profile.bramKb,
        profile.blockRamBlocks * profile.blockRamBlockKib,
        profile.device,
      );
    }
  }
});

test("UP5K block RAM and single-port RAM remain separate and package aliases resolve", () => {
  for (const id of ["ice40up5k-sg48", "ice40-up5k-uwg30", "iCE40UP5KSG48"]) {
    const profile = getFpgaById(id);
    assert.equal(profile.logicCells, 5280);
    assert.equal(profile.bramKb, 120);
    assert.equal(profile.spramKb, 1024);
    assert.equal(profile.dsp, 8);
  }
  assert.equal(getFpgaById("ice40-hx8k-tq144:4k").logicCells, 3520);
  assert.equal(getFpgaById("LIFCL-40-9BG256C").bramKb, 1512);
  assert.equal(getFpgaById("M2GL010-1VF400").logicCells, 12084);
  assert.equal(getFpgaById("MPF100T-1FCVG484").logicCells, 109000);
  assert.equal(getFpgaById("T800F81C2"), undefined);
  assert.equal(getFpgaById("GW1N-1P5"), undefined);
});

test("ECP5 datasheet memory, multiplier and PLL counts replace incorrect legacy numbers", () => {
  for (const [part, bram, multipliers, pll] of [
    ["lfe5u-12f-tqfp144", 576, 28, 2],
    ["lfe5u-25f-csfbga285", 1008, 28, 2],
    ["lfe5um5g-45f-cabga381", 1944, 72, 4],
    ["lfe5um-85f-cabga756", 3744, 156, 4],
  ]) {
    const profile = getFpgaById(part);
    assert.equal(profile.bramKb, bram);
    assert.equal(profile.dsp, multipliers);
    assert.equal(profile.pll, pll);
    assert.equal(profile.dspUnit, "18 × 18 multipliers");
    assert.match(profile.logicUnit, /nominal/);
  }
});

test("AMD LUT counts are physical LUTs, not vendor-equivalent logic cells", () => {
  const artix = getFpgaById("xc7a35t-csg324-1");
  assert.equal(artix.logicCells, 20800);
  assert.equal(artix.flipFlops, 41600);
  assert.equal(artix.logicUnit, "LUT6s");
  assert.equal(artix.bramKb, 1800);
  assert.equal(getFpgaById("xc6slx45t-fgg484-3").device, "XC6SLX45T");
});

test("Gowin order codes and package-limited PLLs resolve without assuming a LUT/FF ratio", () => {
  assert.equal(getFpgaById("gw1nr-lv9qn88pc6-i5").flipFlops, 6480);
  assert.equal(getFpgaById("GW1NR-9C").logicCells, 8640);
  assert.equal(getFpgaById("GW1NSR-LV4CQN48PC6/I5").logicCells, 4608);
  const nano20 = REAL_BOARDS.find((board) => board.id === "tang-nano-20k");
  assert.equal(getFpgaForBoard(nano20).pll, 2);
  assert.equal(getFpgaForBoard(nano20).bramKb, 828);
});

test("Efinix package PLL counts stay separate from family maxima and decimal memory totals", () => {
  for (const [fpgaId, pll, ram] of [
    ["t8f81c2", 1, 120],
    ["t120f576i4", 8, 5280],
    ["ti60f225c3", 4, 2560],
    ["ti375c529c4", 12, 26880],
  ]) {
    const profile = getFpgaForBoard({
      fpgaId,
      device: fpgaId,
      package: "from order code",
    });
    assert.equal(profile.pll, pll);
    assert.equal(profile.bramKb, ram);
  }
  assert.equal(
    getFpgaForBoard({ fpgaId: "t20f256c4", device: "T20", package: "FBGA256" })
      .pll,
    undefined,
  );
});

test("device metadata neither guesses unresolved board identities nor grants project capabilities", () => {
  for (const board of [
    VIRTUAL_BOARD,
    { device: "ECP5", fpgaId: "unknown", package: "unknown" },
    {
      device: "XC7A35T",
      fpgaId: "xc7a35t",
      package: "unknown",
      identityUnresolved: true,
    },
  ]) {
    assert.equal(getFpgaForBoard(board), undefined);
  }
  const example = REAL_BOARDS.find((board) => board.id === "arty-a7-35t");
  const resolved = getFpgaForBoard(example);
  assert.equal(resolved.id, example.fpgaId);
  assert.equal(resolved.package, example.package);
  assert.equal(resolved.device, example.device);
  assert.ok(!("capabilities" in resolved));
});

test("every enabled hardware build target has sourced resource metadata; catalog-only targets stay gated", () => {
  const hardware = REAL_BOARDS.filter(
    (board) => getBoardCapabilities(board).bitstream.supported,
  );
  assert.ok(hardware.length > 40);
  for (const board of hardware) {
    assert.ok(getFpgaForBoard(board), board.id);
  }
  for (const id of ["arty-a7-35t", "tang-nano-20k", "terasic-de10nano"]) {
    const board = REAL_BOARDS.find((entry) => entry.id === id);
    assert.ok(getFpgaForBoard(board), id);
    assert.equal(getBoardCapabilities(board).bitstream.supported, false, id);
  }
});

test("tool-reported utilization preserves physical primitive units", () => {
  // buildHistory imports the workspace writer, which is irrelevant to read-only metrics.
  const file = readFileSync(
    new URL("../src/lib/buildHistory.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(file, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const metrics = {};
  new Function("require", "exports", compiled)(() => ({}), metrics);
  const parsed = metrics.parseBuildMetrics([
    "Info: TRELLIS_SLICE: 100/ 41820 1%",
    "Info: TRELLIS_COMB: 150/ 83640 1%",
    "Info: ICESTORM_LC: 50/ 5280 1%",
  ]);
  const display = metrics.getDisplayUtilization(parsed.utilization);
  assert.deepEqual(
    display.map((entry) => entry.label),
    ["Slices", "LUT", "Logic cells"],
  );
  assert.deepEqual(
    display.map((entry) => entry.total),
    [41820, 83640, 5280],
  );
});
