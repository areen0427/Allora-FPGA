import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const require = createRequire(import.meta.url),
  cache = new Map();
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
    return load([base, `${base}.ts`, `${base}.tsx`].find(existsSync));
  }, exports);
  return exports;
}
const {
  planBoardMigration,
  migrationEligibility,
  migrationPinProblems,
  hasPendingMigrationReview,
  readMigrationReport,
} = load("../src/lib/boardMigration.ts");
const { getBuildPreflight } = load("../src/lib/buildPreflight.ts");
const { parseImportSources } = load("../src/lib/portImport.ts");
const pin = (name, pad, extra = {}) => ({
  name,
  signal: name,
  pin: pad,
  type: "led",
  verified: true,
  activeLow: false,
  ioStandard: "LVCMOS33",
  ...extra,
});
function board(id, overrides = {}) {
  const led = pin("led", id === "source" ? "1" : "8");
  return {
    id,
    name: id,
    vendor: "test",
    family: "iCE40 UltraPlus",
    fpgaId: "ice40up5k-sg48",
    device: "iCE40UP5K",
    package: "SG48",
    synthesisFlow: "yosys-nextpnr",
    constraintsFile: "pcf",
    toolchain: { synth: "yosys" },
    pins: [led],
    leds: [led],
    buttons: [],
    clocks: [
      {
        name: "clk12",
        pin: id === "source" ? "35" : "20",
        frequency: 12e6,
        verified: true,
      },
    ],
    ...overrides,
  };
}
function snapshot(
  extraFiles = [],
  source = "module top(input clk, output led); assign led=clk; endmodule",
  constraints = "set_io clk 35\nset_io led 1\n",
) {
  const file = (relativePath, content) => ({
    relativePath,
    content,
    size: content.length,
    sha256: "filehash",
  });
  const metadata = {
    name: "Counter",
    boardId: "source",
    language: "SystemVerilog",
    topModule: "top",
    simulation: { clockFrequencyHz: 12e6 },
    peripheralWorkbench: { schemaVersion: 1 },
    custom: "retained",
    aiPinAssignments: { led: "1" },
  };
  const decl = parseImportSources(
    [{ name: "top.sv", content: source }],
    true,
  )[0];
  return {
    projectPath: "/project",
    fingerprint: "a".repeat(64),
    directories: ["src", "constraints"],
    excluded: ["build", ".git"],
    topModule: "top",
    portError: null,
    ports: decl.outputs.map((port) => ({
      name: port.name,
      direction: port.direction,
      width: port.width,
      offset: port.indices ? Math.min(...port.indices) : 0,
      upto: Boolean(port.width > 1 && port.indices[0] < port.indices.at(-1)),
    })),
    files: [
      file("allora-project.json", JSON.stringify(metadata)),
      file("src/top.sv", source),
      file("constraints/constraints.pcf", constraints),
      ...extraFiles,
    ],
  };
}

test("automatic migration translates physical pads and retains independent project state", () => {
  const source = snapshot(),
    before = JSON.stringify(source);
  const plan = planBoardMigration(
    source,
    board("source"),
    board("destination"),
  );
  assert.equal(plan.automatic, true);
  assert.equal(JSON.stringify(source), before);
  const constraints = plan.patches.find((p) =>
    p.relativePath.endsWith(".pcf"),
  ).content;
  assert.match(constraints, /set_io clk 20/);
  assert.match(constraints, /set_io led 8/);
  const metadata = JSON.parse(
    plan.patches.find((p) => p.relativePath === "allora-project.json").content,
  );
  assert.equal(metadata.boardId, "destination");
  assert.equal(metadata.custom, "retained");
  assert.deepEqual(metadata.simulation, { clockFrequencyHz: 12e6 });
  assert.equal(metadata.aiPinAssignments, undefined);
  assert.equal(
    plan.patches.some((p) => p.relativePath === "src/top.sv"),
    false,
  );
  assert.deepEqual(plan.archivePaths, ["constraints/constraints.pcf"]);
});

test("ambiguous destination resources require user selection", () => {
  const dest = board("destination", {
    pins: [pin("a", "8"), pin("b", "9")],
    leds: [],
  });
  assert.equal(
    planBoardMigration(snapshot(), board("source"), dest).automatic,
    false,
  );
  const selected = planBoardMigration(snapshot(), board("source"), dest, {
    mappings: { led: "pin:b:9" },
  });
  assert.equal(selected.automatic, true);
  assert.match(selected.patches[0].content, /set_io led 9/);
});

test("a clock rate change requires explicit cycle semantics", () => {
  const dest = board("destination", {
    clocks: [{ name: "clk25", pin: "20", frequency: 25e6, verified: true }],
  });
  const automatic = planBoardMigration(snapshot(), board("source"), dest);
  assert.equal(automatic.automatic, false);
  assert.ok(
    automatic.issues.some(
      (item) => item.id === "clock-rate:clk" && item.level === "manual",
    ),
  );
  const accepted = planBoardMigration(snapshot(), board("source"), dest, {
    keepCycles: { clk: true },
  });
  assert.equal(accepted.automatic, true);
  assert.equal(
    accepted.patches.some((p) => p.relativePath === "src/top.sv"),
    false,
  );
});

test("unknown constraints and device-specific primitives survive as manual issues", () => {
  const source = snapshot(
    [],
    "module top(input clk, output led); SB_HFOSC osc(); assign led=clk; endmodule",
    "set_io clk 35\nset_io led 1\nset_frequency clk 24\n",
  );
  const plan = planBoardMigration(
    source,
    board("source"),
    board("destination"),
  );
  assert.equal(plan.automatic, false);
  assert.ok(plan.issues.some((item) => item.id.startsWith("custom:")));
  assert.ok(plan.issues.some((item) => item.id.startsWith("primitive:")));
  assert.equal(plan.archivePaths.length, 1);
});

test("clock frequency parameters change only with explicit user selection", () => {
  const src = snapshot(
    [],
    "module top #(parameter integer CLK_HZ = 12_000_000)(input clk, output led); assign led=clk; endmodule",
  );
  const target = board("destination", {
    clocks: [{ name: "clk25", pin: "20", frequency: 25e6, verified: true }],
  });
  const unchanged = planBoardMigration(src, board("source"), target);
  assert.equal(
    unchanged.patches.some((patch) => patch.relativePath === "src/top.sv"),
    false,
  );
  const changed = planBoardMigration(src, board("source"), target, {
    clockParameters: { clk: "src/top.sv:CLK_HZ" },
  });
  assert.equal(changed.automatic, true);
  assert.match(
    changed.patches.find((patch) => patch.relativePath === "src/top.sv")
      .content,
    /CLK_HZ = 25000000/,
  );
  assert.match(src.files[1].content, /12_000_000/);
});

test("duplicate or unverified assignments never pass automatically", () => {
  const two =
    "module top(input clk, output led, output other); assign led=clk; assign other=clk; endmodule";
  const src = board("source", {
    pins: [pin("led", "1"), pin("other", "2")],
    leds: [],
  });
  const dest = board("destination", {
    pins: [pin("led", "8"), pin("other", "9")],
    leds: [],
  });
  const draft = snapshot(
    [],
    two,
    "set_io clk 35\nset_io led 1\nset_io other 2",
  );
  const collision = planBoardMigration(draft, src, dest, {
    mappings: { other: "pin:led:8" },
  });
  assert.ok(collision.issues.some((item) => item.id === "conflict:other"));
  const unverified = board("destination", {
    pins: [pin("led", "8", { verified: false })],
    leds: [],
  });
  assert.equal(
    planBoardMigration(snapshot(), board("source"), unverified).automatic,
    false,
  );
});

test("exact ascending, nonzero and one-bit vector indices survive migration", () => {
  const source = snapshot(
    [],
    "module top(input clk, output [8:9] leds, output [4:4] flag, output [0:0] one); assign leds=0; assign flag=0; assign one=0; endmodule",
    "set_io clk 35\nset_io leds[8] 1\nset_io leds[9] 2\nset_io flag[4] 3\nset_io one[0] 4",
  );
  const src = board("source", {
    pins: [
      pin("leds8", "1"),
      pin("leds9", "2"),
      pin("flag4", "3"),
      pin("one0", "4"),
    ],
    leds: [],
  });
  const dest = board("destination", {
    pins: [
      pin("leds8", "8"),
      pin("leds9", "9"),
      pin("flag4", "10"),
      pin("one0", "11"),
    ],
    leds: [],
  });
  const plan = planBoardMigration(source, src, dest);
  assert.equal(plan.automatic, true);
  assert.deepEqual(
    plan.mappings.map((row) => row.port.name),
    ["clk", "leds[8]", "leds[9]", "flag[4]", "one[0]"],
  );
  assert.match(plan.patches[0].content, /set_io one\[0\] 11/);
});

test("polarity adapter changes board-facing signals while preserving original logic", () => {
  const dest = board("destination", {
    pins: [pin("led", "8", { activeLow: true })],
    leds: [],
  });
  const source = snapshot(),
    plan = planBoardMigration(source, board("source"), dest);
  assert.equal(plan.automatic, true);
  assert.equal(plan.topModule, "allora_migrated_top");
  const wrapper = plan.patches.find((p) => p.relativePath.endsWith(".sv"));
  assert.match(wrapper.content, /assign led = ~allora_core_led/);
  assert.match(wrapper.content, /top core/);
  const installed = spawnSync("iverilog", ["-V"], { encoding: "utf8" });
  if (installed.status !== 0) return;
  const dir = mkdtempSync(join(import.meta.dirname, ".migration-wrapper-"));
  try {
    writeFileSync(join(dir, "top.sv"), source.files[1].content);
    writeFileSync(join(dir, "wrapper.sv"), wrapper.content);
    writeFileSync(
      join(dir, "tb.sv"),
      "module tb; reg clk=0; wire led; allora_migrated_top dut(clk,led); initial begin #1; if(led !== 1) $fatal; clk=1; #1; if(led !== 0) $fatal; $finish; end endmodule",
    );
    const compile = spawnSync(
      "iverilog",
      [
        "-g2012",
        "-s",
        "tb",
        "-o",
        join(dir, "sim"),
        join(dir, "top.sv"),
        join(dir, "wrapper.sv"),
        join(dir, "tb.sv"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(compile.status, 0, compile.stderr);
    assert.equal(
      spawnSync("vvp", [join(dir, "sim")], { encoding: "utf8" }).status,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unsupported targets and failed elaboration never claim seamless migration", () => {
  const unsupported = board("destination", { synthesisFlow: "vivado" });
  assert.ok(migrationEligibility(unsupported));
  assert.equal(
    planBoardMigration(snapshot(), board("source"), unsupported).blocked,
    true,
  );
  const failed = { ...snapshot(), portError: "Yosys not installed" };
  assert.equal(
    planBoardMigration(failed, board("source"), board("destination")).automatic,
    false,
  );
});

test("manual completion checks elaborated bus coverage and verified destination pads", () => {
  const current = snapshot(
    [],
    "module top(input clk, output [9:8] led); assign led=0; endmodule",
    "set_io clk 35\nset_io led[9] 1\n",
  );
  assert.ok(
    migrationPinProblems(current, board("source")).some((message) =>
      message.includes("led[8]"),
    ),
  );
});

test("malformed or stale migration reports keep build review pending", () => {
  const malformed = JSON.stringify({
    boardId: "destination",
    boardMigration: {
      schemaVersion: 1,
      requiresReview: false,
      issues: [],
      mappings: [],
      changes: [],
    },
  });
  assert.equal(readMigrationReport(malformed), null);
  assert.equal(hasPendingMigrationReview(malformed), true);
  const plan = planBoardMigration(
    snapshot(),
    board("source"),
    board("destination"),
  );
  const metadata = JSON.parse(
    plan.patches.find((patch) => patch.relativePath === "allora-project.json")
      .content,
  );
  assert.equal(hasPendingMigrationReview(JSON.stringify(metadata)), false);
  metadata.boardId = "other-board";
  assert.equal(hasPendingMigrationReview(JSON.stringify(metadata)), true);
});

test("pending manual migrations block build preflight until reviewed", () => {
  const plan = planBoardMigration(
    snapshot(),
    board("source"),
    board("destination", {
      pins: [pin("red", "8"), pin("green", "9")],
      leds: [],
    }),
  );
  const files = plan.patches.map((patch) => ({
    name: patch.relativePath.split("/").at(-1),
    content: patch.content,
  }));
  const checks = getBuildPreflight({
    board: board("destination"),
    files,
    topLevelFileName: "top.sv",
    nativeAvailable: true,
    yosysAvailable: true,
  });
  assert.equal(
    checks.find((check) => check.id === "migration").state,
    "blocked",
  );
});
