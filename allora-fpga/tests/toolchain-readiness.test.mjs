import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const output = {};
const code = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/toolchainReadiness.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
new Function("exports", code)(output);
const { getBoardToolRequirements } = output;
const board = (overrides = {}) => ({
  family: "ECP5",
  synthesisFlow: "yosys-nextpnr",
  toolchain: { synth: "yosys", program: "openFPGALoader" },
  ...overrides,
});
const commands = (target) =>
  getBoardToolRequirements(target).map((tool) => tool.command);

test("board-aware requirements select matching route and pack tools", () => {
  assert.deepEqual(commands(board()), [
    "yosys",
    "nextpnr-ecp5",
    "ecppack",
    "openFPGALoader",
  ]);
  assert.deepEqual(commands(board({ family: "iCE40" })), [
    "yosys",
    "nextpnr-ice40",
    "icepack",
    "openFPGALoader",
  ]);
  assert.deepEqual(commands(board({ family: "Unknown" })), [
    "yosys",
    "openFPGALoader",
  ]);
  assert.deepEqual(commands(board({ identityUnresolved: true })), [
    "yosys",
    "openFPGALoader",
  ]);
  assert.deepEqual(
    commands(board({ family: "Virtual", toolchain: { synth: "" } })),
    [],
  );
});

test("vendor suite requirements deduplicate tools and retain operation purposes", () => {
  const tools = getBoardToolRequirements(
    board({
      synthesisFlow: "vivado",
      toolchain: { synth: "vivado", placeRoute: "vivado", program: "vivado" },
    }),
  );
  assert.equal(tools.length, 1);
  assert.equal(tools[0].command, "vivado");
  assert.match(tools[0].purpose, /Synthesis.*Place and route.*Programming/);
  assert.match(tools[0].downloadUrl, /amd\.com/);
  assert.deepEqual(
    commands(
      board({
        synthesisFlow: "gowin",
        toolchain: { synth: "gowin", placeRoute: "gowin" },
      }),
    ),
    ["gw_sh"],
  );
});

test("programmer metadata takes precedence while alternatives and shell strings are excluded", () => {
  assert.deepEqual(commands(board({ programmer: { command: "dfu-util" } })), [
    "yosys",
    "nextpnr-ecp5",
    "ecppack",
    "dfu-util",
  ]);
  for (const program of [
    "openocd / dfu-util",
    "openocd --help",
    "$(openocd)",
    "/usr/bin/openocd",
    "unknown-programmer",
  ]) {
    assert.deepEqual(
      commands(board({ toolchain: { synth: "yosys", program } })),
      ["yosys", "nextpnr-ecp5", "ecppack"],
    );
  }
  const tools = getBoardToolRequirements(board());
  assert.ok(
    tools.every(
      (tool) =>
        tool.installHint.includes("rescan") &&
        tool.downloadUrl.startsWith("https://"),
    ),
  );
  assert.match(tools[0].installHint, /OSS CAD Suite.*PATH/);
});
