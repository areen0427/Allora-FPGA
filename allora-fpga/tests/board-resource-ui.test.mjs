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
const { getBoardLayout } = load("../src/data/boardLayouts.ts");
const { formatClockFrequency, getResourceGroupsForBrowser } = load(
  "../src/data/pinResourceGroups.ts",
);
const { REAL_BOARDS, VIRTUAL_BOARD } = load("../src/data/boards.ts");

function exportFixture(format) {
  const board = {
    ...REAL_BOARDS[0],
    constraintsFile: format,
    clocks: [], leds: [], buttons: [],
    pins: [1, 2, 3].map((index) => ({
      name: `pad${index}`, pin: `P${index}`, type: "gpio", verified: true,
    })),
  };
  const ports = [
    { name: "enable", direction: "input" },
    { name: "status[0]", baseName: "status", index: 0, direction: "output" },
    { name: "data[1]", baseName: "data", index: 1, direction: "inout" },
  ];
  const mappings = Object.fromEntries(ports.map((port, index) => [port.name, `pin:pad${index + 1}:P${index + 1}`]));
  const { createWelcomeConstraintDownload } = load("../src/pages/welcome/welcomePinConstraints.ts");
  return { board, ports, mappings, download: createWelcomeConstraintDownload(board, ports, mappings) };
}

test("Quartus downloads preserve scalar and bus mappings when reloaded", () => {
  const { readPinMappingsFromConstraints } = load("../src/pages/dashboard/pinMappingUtils.ts");
  const { board, ports, mappings, download } = exportFixture("qsf");
  assert.equal(download.extension, "qsf");
  assert.deepEqual(readPinMappingsFromConstraints(board, ports, download.content), mappings);
  // Existing plain scalar and quoted Quartus references still load.
  assert.deepEqual(readPinMappingsFromConstraints(board, ports, 'set_location_assignment PIN_P1 -to enable\nset_location_assignment PIN_P2 -to "status[0]"\nset_location_assignment PIN_P3 -to {data[1]}'), mappings);
});

test("Quartus downloads execute as Tcl with literal bus port names", (t) => {
  const probe = spawnSync("tclsh", [], { input: "exit 0\n", encoding: "utf8" });
  if (probe.error?.code === "ENOENT") return t.skip("tclsh is not installed");
  const { download } = exportFixture("qsf");
  const result = spawnSync("tclsh", [], {
    input: `proc set_location_assignment {pin flag port} {puts [list $pin $flag $port]}\nif {[catch {\n${download.content}\n} message]} {puts stderr $message; exit 1}\n`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(result.stdout.replaceAll("\r\n", "\n"), "PIN_P1 -to enable\nPIN_P2 -to {status[0]}\nPIN_P3 -to {data[1]}\n");
});

test("GateMate downloads retain input, output and bidirectional declarations on reload", () => {
  const { readPinMappingsFromConstraints } = load("../src/pages/dashboard/pinMappingUtils.ts");
  const { board, ports, mappings, download } = exportFixture("ccf");
  assert.equal(download.extension, "ccf");
  assert.match(download.content, /^Pin_in "enable" Loc = "P1";$/m);
  assert.match(download.content, /^Pin_out "status\[0\]" Loc = "P2";$/m);
  assert.match(download.content, /^Pin_inout "data\[1\]" Loc = "P3";$/m);
  assert.deepEqual(readPinMappingsFromConstraints(board, ports, download.content), mappings);
  assert.equal(readPinMappingsFromConstraints(board, ports, 'Pin_in "enable" Loc = "P1"').enable, mappings.enable);
});

test("every physical catalog diagram exposes all LEDs, buttons, clock sources and peripheral contacts", () => {
  for (const board of REAL_BOARDS) {
    const layout = getBoardLayout(board);
    const byKind = (kind) =>
      layout.components.filter((component) => component.kind === kind);
    assert.equal(
      byKind("led").length,
      new Set(board.leds.map((pin) => `${pin.name}:${pin.pin}`)).size,
      `${board.id} LEDs`,
    );
    assert.equal(
      byKind("button").length,
      new Set(board.buttons.map((pin) => `${pin.name}:${pin.pin}`)).size,
      `${board.id} buttons`,
    );
    assert.equal(
      byKind("clock").length,
      board.clocks.length,
      `${board.id} clocks`,
    );
    const peripheralPins = getResourceGroupsForBrowser(board)
      .flatMap((group) => group.pins)
      .filter(
        (pin) =>
          !["led", "button"].includes(pin.type) && pin.key.startsWith("pin:"),
      );
    assert.deepEqual(
      byKind("pin")
        .map((pin) => pin.pinName)
        .sort(),
      peripheralPins.map((pin) => pin.name).sort(),
      `${board.id} peripheral pins`,
    );
    assert.equal(
      byKind("usb").length,
      0,
      `${board.id} does not invent a USB connector`,
    );
    for (const component of layout.components) {
      assert.ok(
        component.x >= 0 &&
          component.y >= 0 &&
          component.x <= layout.width &&
          component.y <= layout.height,
        `${board.id} ${component.kind} fits the diagram`,
      );
      if (component.w) assert.ok(component.x + component.w <= layout.width);
      if (component.h) assert.ok(component.y + component.h <= layout.height);
    }
  }
});

test("fractional and low-frequency oscillators preserve their exact catalog values", () => {
  assert.equal(formatClockFrequency(12_288_000), "12.288 MHz");
  assert.equal(formatClockFrequency(32_768), "32.768 kHz");
  assert.equal(formatClockFrequency(50), "50 Hz");
  assert.equal(formatClockFrequency(0), "Unknown frequency");
  const board = {
    ...REAL_BOARDS[0],
    clocks: [
      { name: "audio", pin: "P1", frequency: 12_288_000, verified: true },
      { name: "rtc", pin: "P2", frequency: 32_768, verified: true },
      {
        name: "hfosc",
        source: "internal-hfosc",
        frequency: 48_000_000,
        verified: true,
      },
    ],
  };
  assert.deepEqual(
    getBoardLayout(board)
      .components.filter((part) => part.kind === "clock")
      .map((part) => part.label),
    ["12.288 MHz", "32.768 kHz", "48 MHz"],
  );
  const clocks = getResourceGroupsForBrowser(board).find(
    (group) => group.title === "Clocks",
  ).pins;
  assert.equal(clocks[2].assignable, false);
  assert.equal(clocks[2].pin, "Internal");
});

test("catalog changes grow the same resource diagram without truncating a larger board", () => {
  const pin = (name, type, index) => ({
    name,
    type,
    pin: `P${index}`,
    verified: true,
  });
  const board = {
    ...REAL_BOARDS[0],
    pins: [],
    clocks: [],
    leds: Array.from({ length: 48 }, (_, index) =>
      pin(`led${index}`, "led", index),
    ),
    buttons: Array.from({ length: 24 }, (_, index) =>
      pin(`button${index}`, "button", index + 48),
    ),
  };
  board.pins = [
    ...board.leds,
    ...board.buttons,
    ...Array.from({ length: 130 }, (_, index) => ({
      ...pin(`gpio${index}`, "gpio", index + 72),
      group: "Expansion",
    })),
  ];
  const layout = getBoardLayout(board);
  assert.equal(
    layout.components.filter((part) => part.kind === "led").length,
    48,
  );
  assert.equal(
    layout.components.filter((part) => part.kind === "button").length,
    24,
  );
  assert.equal(
    layout.components.filter((part) => part.kind === "pin").length,
    130,
  );
  assert.ok(layout.height > 100);
  const expansion = layout.components.find((part) => part.kind === "header");
  assert.equal(expansion.label, "Expansion · 130");
});

test("virtual target retains its previous empty-board layout", () => {
  const layout = getBoardLayout(VIRTUAL_BOARD);
  assert.equal(layout.width, 100);
  assert.equal(layout.height, 56);
  assert.deepEqual(
    layout.components.map((component) => component.kind),
    ["usb", "chip", "header", "header"],
  );
});

test("shared resource summary displays explicit memory and DSP units, exact clocks and unknown silicon honestly", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { default: Summary } = load(
    "../src/components/BoardResourceSummary.tsx",
  );
  const board = REAL_BOARDS.find((entry) => entry.id === "icebreaker");
  const markup = renderToStaticMarkup(React.createElement(Summary, { board }));
  assert.match(markup, /LUT4s/);
  assert.match(markup, /120 Kibit/);
  assert.match(markup, /SPRAM/);
  assert.match(markup, /1,024 Kibit/);
  assert.match(markup, /16 × 16 MAC blocks/);
  assert.match(markup, /12 MHz/);
  assert.match(markup, /Device resource sources/);
  const unknown = renderToStaticMarkup(
    React.createElement(Summary, {
      board: { ...board, identityUnresolved: true },
    }),
  );
  assert.match(unknown, /Not verified/);
  assert.doesNotMatch(unknown, /120 Kibit|1,024 Kibit/);
});

test("every assignable resource uses the same mapping key in the workspace and read-only catalog", () => {
  const { getPinOptions } = load("../src/pages/dashboard/pinMappingUtils.ts");
  for (const board of REAL_BOARDS) {
    const options = new Map(getPinOptions(board).map((pin) => [pin.key, pin]));
    for (const resource of getResourceGroupsForBrowser(board).flatMap(
      (group) => group.pins,
    )) {
      if (resource.assignable === false) continue;
      assert.equal(
        options.get(resource.key)?.pin,
        resource.pin,
        `${board.id}: ${resource.key}`,
      );
    }
  }
});

test("unknown electrical metadata is never silently promoted to active high or LVCMOS33", () => {
  const { getPinOptions, createPinMappingConstraints } = load(
    "../src/pages/dashboard/pinMappingUtils.ts",
  );
  const board = {
    ...REAL_BOARDS[0],
    pins: [{ name: "led", pin: "P1", type: "led", verified: true }],
    leds: [],
    buttons: [],
    clocks: [],
    constraintsFile: "lpf",
  };
  const resources = getResourceGroupsForBrowser(board).flatMap(
    (group) => group.pins,
  );
  assert.match(resources[0].detail, /Polarity not documented/);
  assert.doesNotMatch(resources[0].detail, /Active high/);
  assert.equal(getPinOptions(board)[0].ioStandard, undefined);
  const constraints = createPinMappingConstraints(
    board,
    [{ name: "out", direction: "output" }],
    { out: "pin:led:P1" },
  );
  assert.match(constraints, /SITE "P1"/);
  assert.match(constraints, /I\/O standard is not documented/);
  assert.doesNotMatch(constraints, /LVCMOS33|IO_TYPE=undefined/);
});

test("compact setup overview preserves all group counts without shrinking every contact into unreadable dots", () => {
  const board = REAL_BOARDS.find((entry) => entry.id === "ulx3s-85f");
  const full = getBoardLayout(board);
  const compact = getBoardLayout(board, true);
  const groups = (layout) =>
    layout.components
      .filter((part) => part.kind === "header")
      .map((part) => part.label)
      .sort();
  assert.deepEqual(groups(compact), groups(full));
  assert.equal(
    compact.components.filter((part) => part.kind === "led").length,
    board.leds.length,
  );
  assert.equal(
    compact.components.filter((part) => part.kind === "button").length,
    board.buttons.length,
  );
  assert.equal(
    compact.components.filter((part) => part.kind === "clock").length,
    board.clocks.length,
  );
  assert.ok(compact.height < full.height);
});

test("dedicated reference sources remain visible without becoming ordinary clock assignments", () => {
  const { getPinOptions, createSuggestedMappings } = load(
    "../src/pages/dashboard/pinMappingUtils.ts",
  );
  const board = {
    ...REAL_BOARDS[0],
    pins: [],
    leds: [],
    buttons: [],
    clocks: [
      {
        name: "clk100",
        pin: "P1",
        frequency: 100_000_000,
        role: "system",
        verified: true,
      },
      {
        name: "clk125",
        pin: "P2",
        frequency: 125_000_000,
        role: "reference",
        verified: true,
      },
    ],
  };
  const clocks = getResourceGroupsForBrowser(board).find(
    (group) => group.title === "Clocks",
  ).pins;
  assert.equal(clocks[1].assignable, false);
  assert.match(clocks[1].detail, /Dedicated reference/);
  assert.equal(
    getPinOptions(board).some((pin) => pin.key === "clock:clk125"),
    false,
  );
  assert.deepEqual(
    createSuggestedMappings(
      [{ name: "clk125", direction: "input" }],
      [],
      board.clocks,
    ),
    {},
  );
  assert.equal(
    getBoardLayout(board).components.filter((part) => part.kind === "clock")
      .length,
    2,
  );
});

test("unverified facts stay visible but cannot become saved or suggested hardware assignments", () => {
  const { getPinOptions, createSuggestedMappings } = load(
    "../src/pages/dashboard/pinMappingUtils.ts",
  );
  const board = {
    ...REAL_BOARDS[0],
    leds: [],
    buttons: [],
    pins: [{ name: "led0", pin: "P1", type: "led", verified: false }],
    clocks: [
      { name: "clk25", pin: "P2", frequency: 25_000_000, verified: false },
    ],
  };
  const entries = getResourceGroupsForBrowser(board).flatMap(
    (group) => group.pins,
  );
  assert.equal(entries.length, 2);
  assert.ok(entries.every((pin) => pin.assignable === false));
  assert.ok(entries.every((pin) => /Unverified/.test(pin.detail)));
  assert.deepEqual(getPinOptions(board), []);
  assert.deepEqual(
    createSuggestedMappings(
      [
        { name: "clk25", direction: "input" },
        { name: "led0", direction: "output" },
      ],
      board.pins,
      board.clocks,
    ),
    {},
  );
});

test("automatic mapping never assigns two aliases of one package pad to different ports", () => {
  const { createSuggestedMappings } = load(
    "../src/pages/dashboard/pinMappingUtils.ts",
  );
  const pins = [
    { name: "led0", pin: "P1", type: "led", verified: true },
    { name: "gpio0", pin: "P1", type: "gpio", verified: true },
  ];
  const mapping = createSuggestedMappings(
    [
      { name: "led0", direction: "output" },
      { name: "gpio0", direction: "output" },
    ],
    pins,
    [],
  );
  assert.equal(mapping.led0, "pin:led0:P1");
  assert.equal(mapping.gpio0, undefined);
});

test("configuration-flash and dedicated differential reference pads remain reserved through GPIO aliases", () => {
  const { getPinOptions, createSuggestedMappings } = load(
    "../src/pages/dashboard/pinMappingUtils.ts",
  );
  const board = {
    ...REAL_BOARDS[0],
    leds: [],
    buttons: [],
    clocks: [
      {
        name: "serdes",
        pin: "P1",
        differentialPin: "P2",
        role: "reference",
        frequency: 100_000_000,
        verified: true,
      },
    ],
    pins: [
      { name: "ref_alias_p", pin: "P1", type: "gpio", verified: true },
      { name: "ref_alias_n", pin: "P2", type: "gpio", verified: true },
      { name: "flash_cs", pin: "P3", type: "flash", verified: true },
      { name: "gpio_alias", pin: "P3", type: "gpio", verified: true },
    ],
  };
  assert.ok(
    getResourceGroupsForBrowser(board)
      .flatMap((group) => group.pins)
      .every((pin) => pin.assignable === false),
  );
  assert.deepEqual(getPinOptions(board), []);
  assert.deepEqual(
    createSuggestedMappings(
      board.pins.map((pin) => ({ name: pin.name, direction: "output" })),
      board.pins,
      board.clocks,
    ),
    {},
  );
});

test("incomplete electrical standards require review before workspace saves LPF/XDC mappings", () => {
  const { getPinMappingElectricalIssues } = load(
    "../src/pages/dashboard/pinMappingUtils.ts",
  );
  const board = {
    ...REAL_BOARDS[0],
    pins: [{ name: "out", pin: "P1", type: "gpio", verified: true }],
    leds: [],
    buttons: [],
    clocks: [],
    constraintsFile: "lpf",
  };
  const ports = [{ name: "out", direction: "output" }];
  assert.match(
    getPinMappingElectricalIssues(board, ports, { out: "pin:out:P1" })[0],
    /no documented I\/O standard/,
  );
  assert.deepEqual(
    getPinMappingElectricalIssues(
      { ...board, pins: [{ ...board.pins[0], ioStandard: "LVCMOS18" }] },
      ports,
      { out: "pin:out:P1" },
    ),
    [],
  );
  assert.deepEqual(
    getPinMappingElectricalIssues({ ...board, constraintsFile: "pcf" }, ports, {
      out: "pin:out:P1",
    }),
    [],
  );
});

test("read-only large-board diagrams summarize contacts while workspace diagrams retain every contact and zoom controls", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { default: Diagram } = load("../src/components/BoardDiagram.tsx");
  const { default: Board } = load("../src/components/VirtualBoard.tsx");
  const board = REAL_BOARDS.find((entry) => entry.id === "xilinx-vcu118");
  const overview = renderToStaticMarkup(React.createElement(Diagram, { board }));
  assert.doesNotMatch(overview, /class="vboard-resource-pin"/);
  assert.match(overview, /board-rail-label/);
  assert.match(overview, /Connector FMCP_HSPC/);
  const workspace = renderToStaticMarkup(React.createElement(Board, { board, selectable: true, onSelectPin: () => {} }));
  assert.ok((workspace.match(/class="vboard-resource-pin"/g) ?? []).length > 500);
  assert.match(workspace, /Board diagram zoom/);
  assert.match(workspace, /Zoom board in/);
});
