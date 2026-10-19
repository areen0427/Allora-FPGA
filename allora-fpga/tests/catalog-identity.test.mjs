import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const exports = {};
const source = readFileSync(
  new URL("../src/data/boards/catalogIdentity.ts", import.meta.url),
  "utf8",
);
new Function(
  "require",
  "exports",
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
)(require, exports);
const { normalizeCatalogIdentity } = exports;

function board(fpgaId, device = "LegacyCombinedPart", packageName = "2") {
  return {
    id: "fixture",
    name: "Fixture",
    vendor: "Vendor",
    family: "Artix-7",
    device,
    package: packageName,
    fpgaId,
    constraintsFile: "xdc",
    synthesisFlow: "vivado",
    toolchain: { synth: "vivado" },
    pins: [],
    leds: [],
    buttons: [],
    clocks: [],
    identityUnresolved: true,
  };
}

test("separates known published glued AMD silicon/package identities", () => {
  const parts = [
    ["xc7a200tfbg484-1", "XC7A200T", "FBG484"],
    ["xc7s25csga225-2", "XC7S25", "CSGA225"],
    ["xc7a200tsbg484-2", "XC7A200T", "SBG484"],
    ["xc7a35tcsg324-2", "XC7A35T", "CSG324"],
    ["xc7s25ftgb196-1", "XC7S25", "FTGB196"],
    ["xc7z020clg400-1", "XC7Z020", "CLG400"],
    ["xc7vx485tffg1761-2", "XC7VX485T", "FFG1761"],
    ["xc7z045ffg900-2", "XC7Z045", "FFG900"],
    ["xc7z010clg225-1", "XC7Z010", "CLG225"],
    ["xc7a100tfgg484-1", "XC7A100T", "FGG484"],
    ["xc7k160tffg676-1", "XC7K160T", "FFG676"],
    ["xc7k70tfbg484-1", "XC7K70T", "FBG484"],
    ["xc7vx690tffg1761-3", "XC7VX690T", "FFG1761"],
    ["xc7a100tcsg324-1", "XC7A100T", "CSG324"],
    ["xc7z020clg484-1", "XC7Z020", "CLG484"],
    ["xc7a35tftg256-1", "XC7A35T", "FTG256"],
    ["xc7a50tcpg236-2", "XC7A50T", "CPG236"],
    ["xc7a50tfgg484-1", "XC7A50T", "FGG484"],
  ];
  for (const [part, device, packageName] of parts) {
    const result = normalizeCatalogIdentity(board(part));
    assert.equal(result.device, device, part);
    assert.equal(result.package, packageName, part);
    assert.equal(result.fpgaId, part);
  }
});

test("handles package-before-speed and Spartan-6 speed-before-package formats", () => {
  for (const [part, device, packageName] of [
    ["xc6slx9-2-tqg144", "XC6SLX9", "TQG144"],
    ["xc6slx16-2-ftg256", "XC6SLX16", "FTG256"],
    ["xc7a100t-fgg676-2", "XC7A100T", "FGG676"],
    ["xcau15p-ffvb676-2-i", "XCAU15P", "FFVB676"],
    ["xcau25p-ffvb676-2-e", "XCAU25P", "FFVB676"],
    ["xcvu33p-fsvh2104-2L-e", "XCVU33P", "FSVH2104"],
  ]) {
    const result = normalizeCatalogIdentity(board(part, "UNKNOWN", "unknown"));
    assert.equal(result.device, device, part);
    assert.equal(result.package, packageName, part);
  }
});

test("normalization preserves all capability, build and pin data and is idempotent", () => {
  const original = board("xc7a200tfbg484-1");
  const result = normalizeCatalogIdentity(original);
  const {
    device: _device,
    package: _package,
    verificationNotes: _notes,
    ...unchanged
  } = result;
  const {
    device: _originalDevice,
    package: _originalPackage,
    ...expected
  } = original;
  assert.deepEqual(unchanged, expected);
  assert.equal(result.pins, original.pins);
  assert.equal(result.toolchain, original.toolchain);
  assert.equal(result.identityUnresolved, true);
  assert.equal(normalizeCatalogIdentity(result), result);
});

test("unknown and non-AMD parts are never guessed, and numeric speed is not presented as a package", () => {
  for (const part of [
    "unknown",
    "5cefa2f23c8",
    "lfe5u-25f-cabga256",
    "xc7a35t",
    "not-a-part",
    "xc7a35t-weird123-1",
  ]) {
    const original = board(part, "UNKNOWN", "unknown");
    assert.equal(normalizeCatalogIdentity(original), original, part);
  }
  assert.equal(
    normalizeCatalogIdentity(board("unknown", "UNKNOWN", "1")).package,
    "unknown",
  );
  assert.equal(
    normalizeCatalogIdentity(board("xc7a35t", "XC7A35T", "2")).package,
    "unknown",
  );
});
