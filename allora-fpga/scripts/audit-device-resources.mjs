#!/usr/bin/env node
// Inventory resolved devices and deliberate gaps without enabling any board capability.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const cache = new Map();
function loadDataModule(path) {
  path = resolve(appRoot, path);
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
    if (!name.startsWith("."))
      throw new Error(`Unexpected data dependency ${name}`);
    const target = resolve(dirname(path), name);
    return loadDataModule(existsSync(target) ? target : `${target}.ts`);
  }, output);
  return output;
}

const { REAL_BOARDS } = loadDataModule("src/data/boards.ts");
const { FPGAS, getFpgaForBoard } = loadDataModule("src/data/fpgas.ts");
const { getBoardCapabilities } = loadDataModule(
  "src/data/boardCapabilities.ts",
);

function gapReason(board) {
  if (board.identityUnresolved)
    return "Published sources disagree on the populated device; no capacity is selected.";
  if (board.fpgaId.toLowerCase() === "10axf40gae")
    return "Nonstandard engineering part identifier; no primary-source mapping to a production silicon density verified.";
  if (/xcu280/i.test(board.fpgaId))
    return "Catalog identifies an ES1 part; production-card resource tables are not assumed to establish ES1 capacity.";
  if (
    /^(unknown|fpga modules|artix-7|kintex-7|ecp5|gowin|cyclone v|zynq-7000|lfcpnx|lifcl)$/i.test(
      board.device,
    )
  )
    return "Board family/platform is known, but a populated device density/variant is not established.";
  return "No manufacturer-backed capacity profile verified for this exact silicon identity.";
}

const boards = REAL_BOARDS.map((board) => {
  const profile = getFpgaForBoard(board);
  const buildEnabled = getBoardCapabilities(board).bitstream.supported;
  if (buildEnabled && !profile)
    throw new Error(
      `Enabled build target lacks resource metadata: ${board.id}`,
    );
  return {
    id: board.id,
    device: board.device,
    package: board.package,
    buildEnabled,
    status: profile ? "sourced" : "unresolved",
    ...(profile
      ? {
          logic: { count: profile.logicCells ?? null, unit: profile.logicUnit },
          flipFlops: profile.flipFlops ?? null,
          blockRamKibit: profile.bramKb ?? null,
          blockRamBlocks: profile.blockRamBlocks ?? null,
          blockRamBlockKibit: profile.blockRamBlockKib ?? null,
          spramKibit: profile.spramKb ?? null,
          largeRamKibit: profile.largeRamKb ?? null,
          ultraRamKibit: profile.ultraRamKb ?? null,
          dsp: { count: profile.dsp ?? null, unit: profile.dspUnit ?? null },
          pll: profile.pll ?? null,
          sources: profile.sources,
          notes: profile.notes ?? null,
        }
      : { reason: gapReason(board) }),
  };
});

const report = {
  checkedAt: "2026-10-16",
  conventions: {
    memory:
      "Kibit = 1024 bits; block RAM excludes SPRAM, LRAM, UltraRAM, distributed, processor and external memories.",
    logic:
      "Architecture-specific physical unit where verified; vendor nominal/equivalent counts are explicitly labeled.",
    missing:
      "null means not verified/not present in this metadata, not zero capacity.",
    scope:
      "Manufacturer capacity metadata does not establish board identity, app toolchain support or physical programming verification.",
  },
  summary: {
    siliconProfiles: FPGAS.length,
    physicalBoards: boards.length,
    sourcedBoards: boards.filter((board) => board.status === "sourced").length,
    unresolvedBoards: boards.filter((board) => board.status === "unresolved")
      .length,
    buildEnabledBoards: boards.filter((board) => board.buildEnabled).length,
  },
  boards,
};

if (process.argv.includes("--write")) {
  const destination = resolve(
    appRoot,
    "../docs/boards/device-resource-audit.json",
  );
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report.summary, destination }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
