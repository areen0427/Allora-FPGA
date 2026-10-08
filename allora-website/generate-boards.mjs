// Generates boards-data.js for the website from the Allora FPGA app's own
// board catalog, so the site always matches what the app actually supports.
//
// Run from the allora-website/ directory:
//   node generate-boards.mjs
//
// Re-run whenever the app's board catalog changes.

import { register } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APP_SRC = "../allora-fpga/src/data";

// --- Resolve the app's extensionless / bundler-style TS imports ----------
const hookSrc = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
export async function resolve(spec, ctx, next) {
  if (spec.startsWith(".")) {
    const p = fileURLToPath(new URL(spec, ctx.parentURL));
    const cands = [p + ".ts", p + ".tsx"];
    if (existsSync(p) && statSync(p).isDirectory()) cands.push(p + "/index.ts");
    else cands.push(p);
    for (const c of cands)
      if (existsSync(c) && statSync(c).isFile())
        return { url: pathToFileURL(c).href, shortCircuit: true };
  }
  return next(spec, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hookSrc)}`, import.meta.url);

const sup = await import(`${APP_SRC}/boardSupport.ts`);
const cap = await import(`${APP_SRC}/boardCapabilities.ts`);

// --- Normalisation helpers ----------------------------------------------
function familyBucket(fam = "") {
  if (/iCE40/i.test(fam)) return "iCE40";
  if (/ECP5/i.test(fam)) return "ECP5";
  if (/Nexus/i.test(fam)) return "Lattice Nexus";
  if (/Artix|Kintex|Virtex|Spartan|Zynq|UltraScale/i.test(fam)) return "Xilinx";
  if (/Cyclone|MAX 10|Stratix|Arria|Agilex/i.test(fam)) return "Intel";
  if (/Gowin/i.test(fam)) return "Gowin";
  if (/Efinix/i.test(fam)) return "Efinix";
  if (/GateMate/i.test(fam)) return "GateMate";
  if (/Microchip/i.test(fam)) return "Microchip";
  if (/QuickLogic/i.test(fam)) return "QuickLogic";
  return "Other";
}

// LUT / memory inferred only for recognized silicon parts, not board families.
// Unknown devices deliberately leave these fields empty.
function partSpecs(device = "") {
  const d = device.toUpperCase();
  if (/^ICE40-?UP5K(?:-|$)/.test(d)) return { luts: "5,280 LUT4", mem: "120 Kb BRAM + 1 Mb SPRAM" };
  const ecp5 = /^LFE5U(?:M5G|M)?-(12F|25F|45F|85F)(?:-|$)/.exec(d)?.[1];
  if (ecp5 === "12F") return { luts: "12,144 LUT4", mem: "304 Kb BRAM" };
  if (ecp5 === "25F") return { luts: "24,288 LUT4", mem: "1,008 Kb BRAM" };
  if (ecp5 === "45F") return { luts: "43,848 LUT4", mem: "1,944 Kb BRAM" };
  if (ecp5 === "85F") return { luts: "83,640 LUT4", mem: "3,744 Kb BRAM" };
  return { luts: "", mem: "" };
}

// Hand-written best-use blurbs for full-flow boards (keyed by app name).
const BEST_USE = {
  iCEBreaker: "Learning open-source FPGA flows and RISC-V on PMODs.",
  "Fomu PVT": "Designs that live entirely inside a USB port.",
  "iCESugar v1.5": "Compact iCE40 dev with an onboard debugger and PMODs.",
  "iCESugar Pro": "ECP5 prototyping with onboard debug and PMODs.",
  ULX3S: "Retro computing, HDMI video, and open-source SoCs.",
  "OrangeCrab r0.2 25F": "Feather-form ECP5 work with DDR3 and native USB.",
  "Colorlight i5": "Low-cost ECP5 deployments and LED-panel driving.",
  ButterStick: "High-speed ECP5 (5G) projects with DDR3.",
  "ECPIX-5": "Networking and PCIe-class ECP5 development.",
  "iCE-V Wireless": "Wireless, ESP32-paired iCE40 edge projects.",
  "Lattice ECP5 EVN": "Official Lattice ECP5 evaluation and bring-up.",
  "Lattice Versa ECP5": "Lattice ECP5 reference and peripheral evaluation.",
  "Lattice iCE40UP5K EVN": "Official iCE40 UltraPlus evaluation board.",
  TrellisBoard: "Large open-source ECP5 reference designs.",
  "LimeSDR Mini V2": "Software-defined radio front-ends.",
  "LiteX Acorn Baseboard": "LiteX SoCs on Acorn accelerator cards.",
  "Hackaday Hadbadge": "Conference-badge demos and learning projects.",
};

// --- Build the records ---------------------------------------------------
function clockStr(hz) {
  return hz > 0 ? `${Math.round(hz / 1e6)} MHz` : "—";
}

function record(item, support) {
  const defs = sup.getBoardDefinitions(item);
  const d = defs[0] || {};
  const pins = Math.max(0, ...defs.map((x) => (x.pins || []).length));
  const clk = Math.max(0, ...defs.flatMap((x) => (x.clocks || []).map((c) => c.frequency || 0)));
  const toolchain = d.synthesisFlow ? cap.getBoardCapabilities(d).toolchain : "—";
  const { luts, mem } = partSpecs(d.device || "");
  const rec = {
    name: item.name,
    family: familyBucket(d.family),
    fpga: d.device || "",
    pins,
    clock: clockStr(clk),
    toolchain,
    support,
  };
  if (support === "full") {
    rec.luts = luts;
    rec.mem = mem;
    rec.best = BEST_USE[item.name] || `Open-source ${rec.family} development on the full Yosys + nextpnr flow.`;
  }
  return rec;
}

const full = sup.getBuildSupportedBoards().map((b) => record(b, "full"));
const pinOnly = sup.getPinMappingOnlyBoards();
const pins = pinOnly.map((b) => record(b, "pins"));

// --- Emit boards-data.js ------------------------------------------------
const banner =
  "// AUTO-GENERATED by generate-boards.mjs from ../allora-fpga/src/data.\n" +
  "// Do not edit by hand — re-run `node generate-boards.mjs` instead.\n";
const out =
  banner +
  `window.ALLORA_BOARDS_FULL = ${JSON.stringify(full, null, 2)};\n` +
  `window.ALLORA_BOARDS_PINS = ${JSON.stringify(pins, null, 2)};\n` +
  `window.ALLORA_PINS_TOTAL = ${pinOnly.length};\n`;

const outPath = fileURLToPath(new URL("./boards-data.js", import.meta.url));
writeFileSync(outPath, out);
console.log(
  `Wrote boards-data.js — ${full.length} build-supported, ${pins.length} pin-mapping-only board entries.`,
);
