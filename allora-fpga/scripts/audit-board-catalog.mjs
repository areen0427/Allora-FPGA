import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

// Source-only loader: it compiles application data modules without starting Tauri.
const cache = new Map();
function load(file) {
  file = resolve(import.meta.dirname, file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", code)(name => {
    const path = resolve(dirname(file), name);
    return load(existsSync(path) ? path : `${path}.ts`);
  }, exports);
  return exports;
}
const WORKPLAN = [
  [
    "Fomu PVT",
    "fomu-pvt"
  ],
  [
    "iCEBreaker",
    "icebreaker"
  ],
  [
    "iCE V Wireless",
    "ice-v-wireless"
  ],
  [
    "Lattice iCE40UP5K EVN",
    "lattice-ice40up5k-evn"
  ],
  [
    "iCESugar Pro",
    "icesugar-pro"
  ],
  [
    "iCESugar v1.5",
    "icesugar-v1-5"
  ],
  [
    "Lattice ECP5 EVN",
    "lattice-ecp5-evn"
  ],
  [
    "Lattice Versa ECP5",
    "lattice-versa-ecp5"
  ],
  [
    "OrangeCrab r0.2 25F",
    "orangecrab-r02-25f"
  ],
  [
    "TrellisBoard",
    "trellisboard"
  ],
  [
    "ButterStick 25F",
    "butterstick-25f"
  ],
  [
    "ButterStick 45F",
    "butterstick-45f"
  ],
  [
    "ButterStick 85F",
    "butterstick-85f"
  ],
  [
    "Colorlight i5",
    "colorlight-i5"
  ],
  [
    "Colorlight i5A 907",
    "colorlight-i5a-907"
  ],
  [
    "ECPIX 5 45F",
    "ecpix-5-45f"
  ],
  [
    "ECPIX 5 85F",
    "ecpix-5-85f"
  ],
  [
    "iCEBreaker Bitsy V0",
    "icebreaker-bitsy-v0"
  ],
  [
    "iCEBreaker Bitsy V1",
    "icebreaker-bitsy-v1"
  ],
  [
    "iCEPi Zero 25F",
    "icepi-zero-25f"
  ],
  [
    "iCEPi Zero 45F",
    "icepi-zero-45f"
  ],
  [
    "Alchitry Cu V1",
    "alchitry-cu"
  ],
  [
    "Cam Link 4K",
    "camlink-4k"
  ],
  [
    "FPC III",
    "fpc-iii"
  ],
  [
    "FPGAwars Alhambra II",
    "fpgawars-alhambra2"
  ],
  [
    "Hackaday Hadbadge",
    "hackaday-hadbadge"
  ],
  [
    "Kosagi Fomu EVT",
    "kosagi-fomu-evt"
  ],
  [
    "Kosagi Fomu Hacker",
    "kosagi-fomu-hacker"
  ],
  [
    "Lattice ECP5 VIP",
    "lattice-ecp5-vip"
  ],
  [
    "LimeSDR Mini V2 v2.3 default assembly",
    "limesdr-mini-v2"
  ],
  [
    "LiteX Acorn Baseboard",
    "litex-acorn-baseboard"
  ],
  [
    "Machdyne Kr\u00f6te",
    "machdyne-krote"
  ],
  [
    "QWERTY Embedded BeagleWire",
    "qwertyembedded-beaglewire"
  ],
  [
    "RCS Arctic Tern BMC Card",
    "rcs-arctic-tern-bmc-card"
  ],
  [
    "Signaloid C0 microSD",
    "signaloid-c0-microsd"
  ],
  [
    "ULX3S 12F",
    "ulx3s-12f"
  ],
  [
    "ULX3S 25F",
    "ulx3s-25f"
  ],
  [
    "ULX3S 45F",
    "ulx3s-45f"
  ],
  [
    "ULX3S 85F",
    "ulx3s-85f"
  ],
  [
    "TinyFPGA B2",
    "tinyfpga-b2"
  ],
  [
    "TinyFPGA BX",
    "tinyfpga-bx"
  ]
];
const { REAL_BOARDS } = load("../src/data/boards.ts");
const { getBoardCapabilities } = load("../src/data/boardCapabilities.ts");
const { getFpgaForBoard } = load("../src/data/fpgas.ts");
const byId = new Map(REAL_BOARDS.map(board => [board.id, board]));
for (const [name, id] of WORKPLAN) if (!byId.has(id)) throw new Error(`Workplan entry missing: ${name} (${id})`);
const count = REAL_BOARDS.reduce((sum, board) => sum + board.pins.length, 0);
let markdown = `# Board data coverage

Generated source metadata coverage. Counts describe catalog pin **aliases**, not unique physical pads, board connectors, independent peripherals, or tested hardware. Alternate interfaces may share pads. See [audit methods and remaining limits](BOARD_DATA_AUDIT.md).

## Workplan cross-reference

All 41 variants in the supplied September 23 workplan map to existing records. The present catalog also contains later additions. Programming profiles and connected-hardware release tests remain separate. LEDs below count independently driven channels; RGB packages contribute three channels. Buttons exclude switches, touch GPIO and non-user reset/configuration functions.

| Workplan entry | Catalog ID | Selected source clock | LED channels / buttons | Status |
| --- | --- | --- | --- | --- |
`;
for (const [name, id] of WORKPLAN) {
  const board = byId.get(id), clock = board.clocks[0];
  const label = clock ? `${clock.name}: ${clock.frequency.toLocaleString("en-US")} Hz, ${clock.pin ?? "internal"}${clock.verified ? "" : " (unverified)"}` : "Not verified";
  markdown += `| ${name} | \`${id}\` | ${label} | ${board.leds.length} / ${board.buttons.length} | ${board.identityUnresolved ? "Identity conflict retained" : "Published metadata reviewed; hardware test pending"} |\n`;
}
markdown += `
## Entire physical catalog

| Board | Catalog ID | Package | Pin aliases | Verified clocks | LED channels | Buttons | Silicon capacity profile | Source |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
`;
for (const board of [...REAL_BOARDS].sort((a, b) => a.name.localeCompare(b.name))) {
  const source = board.sources?.[0];
  markdown += `| ${board.name} | \`${board.id}\` | ${board.package} | ${board.pins.length} | ${board.clocks.filter(clock => clock.verified).length} | ${board.leds.length} | ${board.buttons.length} | ${getFpgaForBoard(board) ? "sourced" : "unresolved"} | ${source ? `[Source](${source.url})` : "Not verified"} |\n`;
}
const result = { workplanEntries: WORKPLAN.length, physicalBoards: REAL_BOARDS.length, pinAliases: count, buildEnabled: REAL_BOARDS.filter(board => getBoardCapabilities(board).bitstream.supported).length };
if (process.argv.includes("--write")) writeFileSync(resolve(import.meta.dirname, "../../docs/boards/BOARD_COVERAGE.md"), markdown);
console.log(JSON.stringify(result, null, 2));
