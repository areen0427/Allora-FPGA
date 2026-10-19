import type { BoardDefinition } from "./boardTypes";

export type FpgaResourceSource = {
  title: string;
  url: string;
  section?: string;
  checkedAt: string;
};

/** Silicon capacities, not board connector counts or a build-utilization estimate.
 * Memory values use Kibit (1024 bits). Logic and DSP units are architecture-specific.
 * Missing fields mean unverified/unknown; zero means the vendor specifies none.
 */
export type FpgaDevice = {
  id: string;
  vendor: string;
  family: string;
  device: string;
  package: string;
  logicCells?: number;
  logicUnit: string;
  flipFlops?: number;
  bramKb?: number;
  blockRamBlocks?: number;
  blockRamBlockKib?: number;
  spramKb?: number;
  largeRamKb?: number;
  ultraRamKb?: number;
  dsp?: number;
  dspUnit?: string;
  pll?: number;
  sources: FpgaResourceSource[];
  verified: true;
  notes?: string;
};

const checkedAt = "2026-10-16";
function source(
  title: string,
  url: string,
  section: string,
): FpgaResourceSource {
  return { title, url, section, checkedAt };
}

export const FPGA_RESOURCE_SOURCES = {
  ice40up: source(
    "Lattice iCE40 UltraPlus family data sheet",
    "https://www.latticesemi.com/-/media/LatticeSemi/Documents/DataSheets/iCE/iCE40-UltraPlus-Family-Data-Sheet.ashx",
    "Table 2.1: family selection guide",
  ),
  ice40: source(
    "Lattice iCE40 LP/HX family data sheet",
    "https://www.latticesemi.com/~/media/LatticeSemi/Documents/DataSheets/iCE/iCE40LPHXFamilyDataSheet.pdf",
    "Family selection guide",
  ),
  ecp5: source(
    "Lattice ECP5 / ECP5-5G device selection guide",
    "https://www.latticesemi.com/Products/FPGAandCPLD/ECP5",
    "Family Table: LUTs, 18-Kbit sysMEM, 18 × 18 multipliers, PLLs",
  ),
  amd7: source(
    "AMD 7 Series FPGAs overview (DS180)",
    "https://docs.amd.com/v/u/en-US/ds180_7Series_Overview",
    "Tables 2, 4, 6, 8: four LUT6s and eight FFs per slice; 36-Kbit BRAM",
  ),
  spartan6: source(
    "AMD Spartan 6 FPGA product table",
    "https://www.amd.com/en/products/adaptive-socs-and-fpgas/fpga/spartan-6.html",
    "LX and LXT product tables",
  ),
  zynq7000: source(
    "AMD Zynq-7000 SoC overview (DS190)",
    "https://docs.amd.com/v/u/en-US/ds190-Zynq-7000-Overview",
    "Table 1: programmable logic resources",
  ),
  ultrascale: source(
    "AMD UltraScale architecture overview (DS890)",
    "https://docs.amd.com/v/u/en-US/ds890-ultrascale-overview",
    "Device feature summaries: CLB LUTs / FFs, 36-Kbit BRAM and DSP slices",
  ),
  cyclone10: source(
    "Altera Cyclone 10 LP device overview",
    "https://cdrdv2-public.intel.com/666875/c10lp-51001-683879-666875.pdf",
    "Table 2: maximum resource counts",
  ),
  cyclone4: source(
    "Altera Cyclone IV device handbook",
    "https://cdrdv2-public.intel.com/653974/cyclone4-handbook.pdf",
    "Chapter 1: device resources",
  ),
  cyclone5: source(
    "Altera Cyclone V FPGA and SoC product table",
    "https://cdrdv2-public.intel.com/714207/cyclone-v-product-table.pdf",
    "ALMs, registers, M10K BRAM and variable-precision DSP blocks",
  ),
  max10: source(
    "Altera MAX 10 FPGA product table",
    "https://cdrdv2-public.intel.com/714204/max-10-product-table.pdf",
    "Maximum resources; PLL counts depend on package",
  ),
  gowin1: source(
    "Gowin LittleBee FPGA device tables",
    "https://www.gowinsemi.com/en/product/littlebee_fpga/",
    "GW1N / GW1NR resource tables",
  ),
  gowin1n: source(
    "Gowin GW1N data sheet (DS100)",
    "https://cdn.gowinsemi.com.cn/DS100E.pdf",
    "Table 1-1: GW1N resources, including legacy GW1N-1",
  ),
  gowin2: source(
    "Gowin GW2AR data sheet (DS226)",
    "https://cdn.gowinsemi.com.cn/DS226E.pdf",
    "Table 1-1: product resources",
  ),
  gowin5: source(
    "Gowin GW5A data sheet (DS1103)",
    "https://cdn.gowinsemi.com.cn/DS1103E.pdf",
    "Table 1-1: product resources",
  ),
  gowin1nsr: source(
    "Gowin GW1NSR data sheet (DS861)",
    "https://cdn.gowinsemi.com.cn/DS861-1.5_GW1NSR%E7%B3%BB%E5%88%97FPGA%E4%BA%A7%E5%93%81%E6%95%B0%E6%8D%AE%E6%89%8B%E5%86%8C.pdf",
    "Table 2-1: GW1NSR-4C resources",
  ),
  gowin2a: source(
    "Gowin Arora II resource tables",
    "https://www.gowinsemi.com/en/product/arora-ii-fpga",
    "GW2A family resource table",
  ),
  trion8: source(
    "Efinix Trion T8 resources",
    "https://www.efinixinc.com/shop/t8.php",
    "Core resources and package PLL table; 24 × 5120-bit BRAM",
  ),
  trion20: source(
    "Efinix Trion T20 resources",
    "https://www.efinixinc.com/shop/t20.php",
    "Core resources and package PLL table; 204 × 5120-bit BRAM",
  ),
  trion120: source(
    "Efinix Trion T120 resources",
    "https://www.efinixinc.com/shop/t120.php",
    "Core resources and package PLL table; 1056 × 5120-bit BRAM",
  ),
  titanium60: source(
    "Efinix Titanium Ti60 resources",
    "https://www.efinixinc.com/shop/ti60.php",
    "Core resources and package PLL table",
  ),
  titanium375: source(
    "Efinix Titanium Ti375 resources",
    "https://www.efinixinc.com/shop/ti375.php",
    "Core resources and package PLL table",
  ),
  polarfire: source(
    "Microchip PolarFire FPGA product table",
    "https://www.microchip.com/en-us/products/fpgas-and-plds/fpgas/polarfire-fpgas",
    "FPGA fabric and 20-Kbit LSRAM (excludes µSRAM and processor memories)",
  ),
  igloo2: source(
    "Microchip IGLOO2 FPGA product brief",
    "https://ww1.microchip.com/downloads/en/DeviceDoc/00003294A.pdf",
    "Device resources; fabric LSRAM only",
  ),
  gatemate: source(
    "Cologne Chip GateMate A1 overview",
    "https://colognechip.com/programmable-logic/gatemate/overview/",
    "CPEs, registers and 20/40-Kbit BRAM",
  ),
  eos3: source(
    "QuickLogic EOS S3 technical reference manual",
    "https://www.quicklogic.com/wp-content/uploads/2024/11/QL-S3-Technical-Reference-Manual.pdf",
    "FPGA fabric resources (excludes Cortex-M4 SRAM)",
  ),
  crosslink: source(
    "Lattice CrossLink-NX device selection guide",
    "https://www.latticesemi.com/Products/FPGAandCPLD/CrossLink-NX",
    "Family table; EBR and LRAM are separate resources",
  ),
  kria: source(
    "AMD Kria K26 SOM data sheet (DS987)",
    "https://docs.amd.com/r/en-US/ds987-k26-som/Programmable-Logic",
    "PL resources",
  ),
  alveo: source(
    "AMD Alveo U200/U250 data sheet (DS962)",
    "https://docs.amd.com/r/en-US/ds962-u200-u250/Alveo-Product-Details",
    "Total card fabric; Vitis dynamic-region resources are smaller",
  ),
  gowin5at: source(
    "Gowin Arora V device resource tables",
    "https://www.gowinsemi.com/en/product/arora-v-fpga/",
    "GW5AT / GW5AST resource tables",
  ),
  topaz: source(
    "Efinix Topaz Tz170 data sheet",
    "https://www.efinixinc.com/docs/topaz170-ds-v1.1.pdf",
    "Tables 1–2: 161,008 LEs, 1088 10-Kbit BRAMs; corrected from early overview",
  ),
  cyclone3: source(
    "Altera Cyclone III family resources",
    "https://cdrdv2-public.intel.com/655476/wp-01046-developing-msan-equipment-using-low-cost-fpgas.pdf",
    "Table 3: Cyclone III resources",
  ),
  agilex3: source(
    "Altera Agilex 3 C-Series device overview",
    "https://docs.altera.com/r/docs/817231/current/agilextm-3-fpgas-and-socs-device-overview/agilextm-3-fpgas-and-socs-c-series",
    "Table 4: A3C135 ALMs, M20K blocks and 18 × 19 multipliers",
  ),
  agilex5: source(
    "Altera Agilex 5 E-Series device overview",
    "https://docs.altera.com/r/docs/762191/current/agilex-5-fpgas-and-socs-device-overview/agilex-5-fpgas-and-socs-e-series",
    "Table 7: A5E008B ALMs, M20K blocks, 18 × 19 multipliers",
  ),
  eagle: source(
    "Anlogic EG4S20 data sheet (DS301 2.7.6, 2024.10)",
    "https://anlogic.oss-cn-shanghai.aliyuncs.com/web_doc/%E5%B7%A5%E5%85%B7%E4%B8%8E%E8%B5%84%E6%96%99%E4%B8%8B%E8%BD%BD/%E6%8A%80%E6%9C%AF%E6%96%87%E6%A1%A3/EG4/%E6%95%B0%E6%8D%AE%E6%89%8B%E5%86%8C/DS301_EG4S20_Datasheet_en.pdf",
    "Table 1-1: 19,600 LUTs / FFs, 64 × 9-Kbit + 16 × 32-Kbit RAM, four PLLs",
  ),
  dragon: source(
    "Anlogic SALDRAGON 1 product selection table",
    "https://www.anlogic.com/product/fpga/saldragon/dr1",
    "DR1V90MEG484 PL resources; excludes PS and NPU memories",
  ),
  machxo3: source(
    "Lattice MachXO3 family data sheet (FPGA-DS-02032 3.5)",
    "https://www.latticesemi.com/view_document?document_id=50121",
    "Figure 2.2 note: 26 EBR blocks; section 2.5 and table 2.5: 9 × 1024 bits/block",
  ),
} satisfies Record<string, FpgaResourceSource>;

type ResourceSpec = Omit<
  FpgaDevice,
  "id" | "vendor" | "family" | "device" | "package" | "sources" | "verified"
>;
function device(
  vendor: string,
  family: string,
  name: string,
  data: ResourceSpec,
  reference: FpgaResourceSource,
): FpgaDevice {
  return {
    id: name.toLowerCase(),
    vendor,
    family,
    device: name,
    package: "Package independent",
    ...data,
    sources: [reference],
    verified: true,
  };
}

const ice40: FpgaDevice[] = [
  device(
    "Lattice",
    "iCE40 UltraPlus",
    "iCE40UP5K",
    {
      logicCells: 5280,
      logicUnit: "LUT4s",
      flipFlops: 5280,
      bramKb: 120,
      blockRamBlocks: 30,
      blockRamBlockKib: 4,
      spramKb: 1024,
      dsp: 8,
      dspUnit: "16 × 16 MAC blocks",
      pll: 1,
    },
    FPGA_RESOURCE_SOURCES.ice40up,
  ),
  ...(
    [
      ["iCE40HX4K", 3520, 80, 20, 2],
      ["iCE40HX8K", 7680, 128, 32, 2],
      ["iCE40LP8K", 7680, 128, 32, 2],
    ] as const
  ).map(([name, logicCells, bramKb, blockRamBlocks, pll]) =>
    device(
      "Lattice",
      "iCE40 LP/HX",
      name,
      {
        logicCells,
        logicUnit: "LUT4s",
        flipFlops: logicCells,
        bramKb,
        blockRamBlocks,
        blockRamBlockKib: 4,
        dsp: 0,
        dspUnit: "hard DSP blocks",
        pll,
      },
      FPGA_RESOURCE_SOURCES.ice40,
    ),
  ),
];

// The vendor selection table publishes nominal 12K/24K/44K/84K LUT densities.
// Do not present those marketing numbers as an exact nextpnr resource denominator.
const ecp5 = (
  [
    ["12F", 12000, 32, 28, 2],
    ["25F", 24000, 56, 28, 2],
    ["45F", 44000, 108, 72, 4],
    ["85F", 84000, 208, 156, 4],
  ] as const
).flatMap(([density, logicCells, blockRamBlocks, dsp, pll]) =>
  (density === "12F" ? ["LFE5U"] : ["LFE5U", "LFE5UM", "LFE5UM5G"]).map(
    (prefix) =>
      device(
        "Lattice",
        "ECP5",
        `${prefix}-${density}`,
        {
          logicCells,
          logicUnit: "LUT4s (nominal)",
          bramKb: blockRamBlocks * 18,
          blockRamBlocks,
          blockRamBlockKib: 18,
          dsp,
          dspUnit: "18 × 18 multipliers",
          pll,
          notes:
            "Two 18 × 18 multipliers share one sysDSP slice. Nominal LUT density is not an exact utilization denominator.",
        },
        FPGA_RESOURCE_SOURCES.ecp5,
      ),
  ),
);

// DS180: LUT6 = slices × 4; FF = slices × 8. Logic-cell marketing equivalents
// are deliberately not substituted for physical LUTs.
const amd7 = (
  [
    ["Spartan-7", "XC7S15", 2000, 10, 20, 2],
    ["Spartan-7", "XC7S25", 3650, 45, 80, 3],
    ["Artix-7", "XC7A35T", 5200, 50, 90, 5],
    ["Artix-7", "XC7A50T", 8150, 75, 120, 5],
    ["Artix-7", "XC7A100T", 15850, 135, 240, 6],
    ["Artix-7", "XC7A200T", 33650, 365, 740, 10],
    ["Kintex-7", "XC7K70T", 10250, 135, 240, 6],
    ["Kintex-7", "XC7K160T", 25350, 325, 600, 8],
    ["Kintex-7", "XC7K325T", 50950, 445, 840, 10],
    ["Kintex-7", "XC7K420T", 65150, 835, 1680, 8],
    ["Kintex-7", "XC7K480T", 74650, 955, 1920, 8],
    ["Virtex-7", "XC7VX485T", 75900, 1030, 2800, 14],
    ["Virtex-7", "XC7VX690T", 108300, 1470, 3600, 20],
  ] as const
).map(([family, name, slices, blockRamBlocks, dsp, pll]) =>
  device(
    "AMD",
    family,
    name,
    {
      logicCells: slices * 4,
      logicUnit: "LUT6s",
      flipFlops: slices * 8,
      bramKb: blockRamBlocks * 36,
      blockRamBlocks,
      blockRamBlockKib: 36,
      dsp,
      dspUnit: "DSP48E1 slices",
      pll,
    },
    FPGA_RESOURCE_SOURCES.amd7,
  ),
);

const spartan6 = (
  [
    ["XC6SLX9", 9152, 576, 16],
    ["XC6SLX16", 14579, 576, 32],
    ["XC6SLX25", 24051, 936, 38],
    ["XC6SLX45", 43661, 2088, 58],
    ["XC6SLX45T", 43661, 2088, 58],
  ] as const
).map(([name, logicCells, bramKb, dsp]) =>
  device(
    "AMD",
    "Spartan-6",
    name,
    {
      logicCells,
      logicUnit: "logic cells (vendor equivalent)",
      bramKb,
      blockRamBlocks: bramKb / 18,
      blockRamBlockKib: 18,
      dsp,
      dspUnit: "DSP48A1 slices",
    },
    FPGA_RESOURCE_SOURCES.spartan6,
  ),
);

const cyclone10 = (
  [
    ["10CL006", 6272, 30, 15, 2],
    ["10CL016", 15408, 56, 56, 4],
    ["10CL025", 24624, 66, 66, 4],
    ["10CL055", 55856, 260, 156, 4],
    ["10CL080", 81264, 305, 244, 4],
  ] as const
).map(([name, logicCells, blockRamBlocks, dsp, pll]) =>
  device(
    "Altera",
    "Cyclone 10 LP",
    name,
    {
      logicCells,
      logicUnit: "logic elements",
      flipFlops: logicCells,
      bramKb: blockRamBlocks * 9,
      blockRamBlocks,
      blockRamBlockKib: 9,
      dsp,
      dspUnit: "18 × 18 multipliers",
      pll,
    },
    FPGA_RESOURCE_SOURCES.cyclone10,
  ),
);

const cyclone4 = (
  [
    ["EP4CE6", 6272, 30, 15, 2],
    ["EP4CE15", 15408, 56, 56, 4],
    ["EP4CE22", 22320, 66, 66, 4],
    ["EP4CE115", 114480, 432, 266, 4],
  ] as const
).map(([name, logicCells, blockRamBlocks, dsp, pll]) =>
  device(
    "Altera",
    "Cyclone IV E",
    name,
    {
      logicCells,
      logicUnit: "logic elements",
      flipFlops: logicCells,
      bramKb: blockRamBlocks * 9,
      blockRamBlocks,
      blockRamBlockKib: 9,
      dsp,
      dspUnit: "18 × 18 multipliers",
      pll,
    },
    {
      ...FPGA_RESOURCE_SOURCES.cyclone4,
      url: "https://cdrdv2-public.intel.com/654630/cyiv-51001.pdf",
      section: "Table 1-1: device resources",
    },
  ),
);

const cyclone4gx = device(
  "Altera",
  "Cyclone IV GX",
  "EP4CGX150",
  {
    logicCells: 149760,
    logicUnit: "logic elements",
    flipFlops: 149760,
    bramKb: 6480,
    blockRamBlocks: 720,
    blockRamBlockKib: 9,
    dsp: 360,
    dspUnit: "18 × 18 multipliers",
    pll: 4,
    notes:
      "Four general-purpose PLLs are counted; four multipurpose PLLs used by transceivers can also feed fabric when available.",
  },
  {
    ...FPGA_RESOURCE_SOURCES.cyclone4,
    section: "Chapter 1, table 1-2: Cyclone IV GX resources",
  },
);

const cyclone5 = (
  [
    ["5CEFA2", 9430, 37736, 176, 25],
    ["5CEBA4", 18480, 73920, 308, 66],
    ["5CEFA5", 29080, 116320, 446, 150],
    ["5CSEMA5", 32070, 128300, 397, 87],
    ["5CSEBA6", 41910, 166036, 557, 112],
    ["5CSXFC6", 41910, 166036, 557, 112],
  ] as const
).map(([name, logicCells, flipFlops, blockRamBlocks, dsp]) =>
  device(
    "Altera",
    "Cyclone V",
    name,
    {
      logicCells,
      logicUnit: "ALMs",
      flipFlops,
      bramKb: blockRamBlocks * 10,
      blockRamBlocks,
      blockRamBlockKib: 10,
      dsp,
      dspUnit: "variable-precision DSP blocks",
      notes:
        "ALMs are not LUTs or equivalent LEs. DSP blocks can implement two 18 × 18 multipliers; MLAB and processor RAM are excluded from BRAM.",
    },
    FPGA_RESOURCE_SOURCES.cyclone5,
  ),
);

const cyclone3 = device(
  "Altera",
  "Cyclone III",
  "EP3C25",
  {
    logicCells: 24624,
    logicUnit: "logic elements",
    flipFlops: 24624,
    bramKb: 594,
    blockRamBlocks: 66,
    blockRamBlockKib: 9,
    dsp: 66,
    dspUnit: "18 × 18 multipliers",
    pll: 4,
  },
  FPGA_RESOURCE_SOURCES.cyclone3,
);

const max10 = (
  [
    ["10M08", 8000, 42, 24],
    ["10M50", 50000, 182, 144],
  ] as const
).map(([name, logicCells, blockRamBlocks, dsp]) =>
  device(
    "Altera",
    "MAX 10",
    name,
    {
      logicCells,
      logicUnit: "logic elements (nominal)",
      bramKb: blockRamBlocks * 9,
      blockRamBlocks,
      blockRamBlockKib: 9,
      dsp,
      dspUnit: "18 × 18 multipliers",
      notes:
        "Nominal density from the vendor product table; PLL availability depends on the package.",
    },
    FPGA_RESOURCE_SOURCES.max10,
  ),
);

const zynq7000 = (
  [
    ["XC7Z010", 17600, 60, 80],
    ["XC7Z020", 53200, 140, 220],
    ["XC7Z045", 218600, 545, 900],
  ] as const
).map(([name, logicCells, blockRamBlocks, dsp]) =>
  device(
    "AMD",
    "Zynq-7000",
    name,
    {
      logicCells,
      logicUnit: "LUT6s",
      flipFlops: logicCells * 2,
      bramKb: blockRamBlocks * 36,
      blockRamBlocks,
      blockRamBlockKib: 36,
      dsp,
      dspUnit: "DSP48E1 slices",
      notes: "Programmable logic only; processing-system memory is excluded.",
    },
    FPGA_RESOURCE_SOURCES.zynq7000,
  ),
);

const ultrascale = (
  [
    ["Artix UltraScale+", "XCAU15P", 77760, 144, 0, 576, 6],
    ["Artix UltraScale+", "XCAU25P", 141000, 300, 0, 1200, 8],
    ["Kintex UltraScale", "XCKU040", 242400, 600, 0, 1920, 20],
    ["Kintex UltraScale+", "XCKU3P", 162720, 360, 48, 1368, 8],
    ["Kintex UltraScale+", "XCKU5P", 216960, 480, 64, 1824, 8],
    ["Virtex UltraScale+", "XCVU9P", 1182240, 2160, 960, 6840, 60],
    ["Virtex UltraScale+", "XCVU13P", 1728000, 2688, 1280, 12288, 32],
    ["Virtex UltraScale+ HBM", "XCVU33P", 439680, 672, 320, 2880, 8],
    ["Virtex UltraScale+ HBM", "XCVU37P", 1303680, 2016, 960, 9024, 24],
    ["Zynq UltraScale+", "XCZU2CG", 47232, 150, 0, 240, 6],
    ["Zynq UltraScale+", "XCZU2EG", 47232, 150, 0, 240, 6],
    ["Zynq UltraScale+", "XCZU7EV", 230400, 312, 96, 1728, 16],
    ["Zynq UltraScale+", "XCZU9EG", 274080, 912, 0, 2520, 8],
    ["Zynq UltraScale+", "XCZU11EG", 298560, 600, 80, 2928, 16],
    ["Zynq UltraScale+ RFSoC", "XCZU49DR", 425280, 1080, 80, 4272, 16],
  ] as const
).map(([family, name, logicCells, blockRamBlocks, ultraRamBlocks, dsp, pll]) =>
  device(
    "AMD",
    family,
    name,
    {
      logicCells,
      logicUnit: "LUT6s",
      flipFlops: logicCells * 2,
      bramKb: blockRamBlocks * 36,
      blockRamBlocks,
      blockRamBlockKib: 36,
      ultraRamKb: ultraRamBlocks * 288,
      dsp,
      dspUnit: "DSP48E2 slices",
      pll,
      notes:
        "PL fabric only. UltraRAM and processor/HBM/external RAM are separate from block RAM. PLLs count general-purpose CMT PLLs, not transceiver PLLs.",
    },
    FPGA_RESOURCE_SOURCES.ultrascale,
  ),
);

const amdModules = [
  device(
    "AMD",
    "Zynq UltraScale+",
    "XCK26",
    {
      logicCells: 117120,
      logicUnit: "LUT6s",
      flipFlops: 234240,
      bramKb: 5184,
      blockRamBlocks: 144,
      blockRamBlockKib: 36,
      ultraRamKb: 18432,
      dsp: 1248,
      dspUnit: "DSP48E2 slices",
      notes:
        "Kria K26 programmable logic; SOM DDR and processor SRAM are excluded.",
    },
    FPGA_RESOURCE_SOURCES.kria,
  ),
  ...(
    [
      ["XCU200", 1182000, 2364000, 960, 6840],
      ["XCU250", 1728000, 3456000, 1280, 12288],
    ] as const
  ).map(([name, logicCells, flipFlops, ultraRamBlocks, dsp]) =>
    device(
      "AMD",
      "Alveo UltraScale+",
      name,
      {
        logicCells,
        logicUnit: "LUT6s (nominal)",
        flipFlops,
        ultraRamKb: ultraRamBlocks * 288,
        dsp,
        dspUnit: "DSP48E2 slices",
        notes:
          "Total fabric from the vendor card table, with LUT/FF counts rounded to thousands. Shell-reserved Vitis dynamic-region capacities are lower. BRAM count is not inferred from a different silicon part.",
      },
      FPGA_RESOURCE_SOURCES.alveo,
    ),
  ),
];

const gowin = [
  device(
    "Gowin",
    "LittleBee",
    "GW1N-1",
    {
      logicCells: 1152,
      logicUnit: "LUT4s",
      flipFlops: 864,
      bramKb: 72,
      blockRamBlocks: 4,
      blockRamBlockKib: 18,
      dsp: 0,
      dspUnit: "18 × 18 multipliers",
      pll: 1,
    },
    FPGA_RESOURCE_SOURCES.gowin1n,
  ),
  device(
    "Gowin",
    "LittleBee",
    "GW1N-4",
    {
      logicCells: 4608,
      logicUnit: "LUT4s",
      flipFlops: 3456,
      bramKb: 180,
      blockRamBlocks: 10,
      blockRamBlockKib: 18,
      dsp: 16,
      dspUnit: "18 × 18 multipliers",
      pll: 2,
    },
    FPGA_RESOURCE_SOURCES.gowin1n,
  ),
  device(
    "Gowin",
    "LittleBee",
    "GW1NR-9",
    {
      logicCells: 8640,
      logicUnit: "LUT4s",
      flipFlops: 6480,
      bramKb: 468,
      blockRamBlocks: 26,
      blockRamBlockKib: 18,
      dsp: 20,
      dspUnit: "18 × 18 multipliers",
      pll: 2,
    },
    FPGA_RESOURCE_SOURCES.gowin1,
  ),
  device(
    "Gowin",
    "LittleBee",
    "GW1NSR-4C",
    {
      logicCells: 4608,
      logicUnit: "LUT4s",
      flipFlops: 3456,
      bramKb: 180,
      blockRamBlocks: 10,
      blockRamBlockKib: 18,
      dsp: 16,
      dspUnit: "18 × 18 multipliers",
      pll: 2,
    },
    FPGA_RESOURCE_SOURCES.gowin1nsr,
  ),
  ...(
    [
      ["GW2AR-18", FPGA_RESOURCE_SOURCES.gowin2],
      ["GW2A-18", FPGA_RESOURCE_SOURCES.gowin2a],
    ] as const
  ).map(([name, reference]) =>
    device(
      "Gowin",
      "Arora II",
      name,
      {
        logicCells: 20736,
        logicUnit: "LUT4s",
        flipFlops: 15552,
        bramKb: 828,
        blockRamBlocks: 46,
        blockRamBlockKib: 18,
        dsp: 48,
        dspUnit: "18 × 18 multipliers",
        notes:
          "PLL availability depends on package; the QN88 package exposes two PLLs.",
      },
      reference,
    ),
  ),
  ...(
    [
      ["GW5A-25", 23040, 56, 28, 6],
      ["GW5A-60", 59904, 118, 118, 8],
      ["GW5A-138", 138240, 340, 298, 12],
    ] as const
  ).map(([name, logicCells, blockRamBlocks, dsp, pll]) =>
    device(
      "Gowin",
      "Arora V",
      name,
      {
        logicCells,
        logicUnit: "LUT4s",
        flipFlops: logicCells,
        bramKb: blockRamBlocks * 18,
        blockRamBlocks,
        blockRamBlockKib: 18,
        dsp,
        dspUnit: "27 × 18 DSP blocks",
        pll,
      },
      FPGA_RESOURCE_SOURCES.gowin5,
    ),
  ),
  ...(
    [
      ["GW5AT-15", 15120, 35, 28, 2],
      ["GW5AT-60", 59904, 118, 118, 8],
      ["GW5AST-138", 138240, 340, 298, 12],
    ] as const
  ).map(([name, logicCells, blockRamBlocks, dsp, pll]) =>
    device(
      "Gowin",
      "Arora V",
      name,
      {
        logicCells,
        logicUnit: "LUT4s",
        flipFlops: logicCells,
        bramKb: blockRamBlocks * 18,
        blockRamBlocks,
        blockRamBlockKib: 18,
        dsp,
        dspUnit: "27 × 18 DSP blocks",
        pll,
        notes:
          name === "GW5AT-15"
            ? "The 12 DSP Lite units are separate from the 28 full DSP blocks."
            : undefined,
      },
      FPGA_RESOURCE_SOURCES.gowin5at,
    ),
  ),
];

const efinix = [
  device(
    "Efinix",
    "Topaz",
    "Tz170",
    {
      logicCells: 161008,
      logicUnit: "logic elements (vendor equivalent)",
      bramKb: 10880,
      blockRamBlocks: 1088,
      blockRamBlockKib: 10,
      dsp: 544,
      dspUnit: "Topaz DSP blocks",
      pll: 8,
      notes:
        "Uses corrected device data sheet values, not the early overview's 172,008 LE / 10 PLL figures.",
    },
    FPGA_RESOURCE_SOURCES.topaz,
  ),
  ...(
    [
      ["T8", 7384, 24, 8, FPGA_RESOURCE_SOURCES.trion8],
      ["T20", 19728, 204, 36, FPGA_RESOURCE_SOURCES.trion20],
      ["T120", 112128, 1056, 320, FPGA_RESOURCE_SOURCES.trion120],
    ] as const
  ).map(([name, logicCells, blockRamBlocks, dsp, reference]) =>
    device(
      "Efinix",
      "Trion",
      name,
      {
        logicCells,
        logicUnit: "logic elements",
        bramKb: blockRamBlocks * 5,
        blockRamBlocks,
        blockRamBlockKib: 5,
        dsp,
        dspUnit: "18 × 18 multipliers",
        notes:
          "BRAM capacity uses 5120-bit blocks, rather than the vendor web table's decimal kbit total. PLL availability depends on package.",
      },
      reference,
    ),
  ),
  ...(
    [
      ["Ti60", 62016, 256, 160, FPGA_RESOURCE_SOURCES.titanium60],
      ["Ti375", 370137, 2688, 1344, FPGA_RESOURCE_SOURCES.titanium375],
    ] as const
  ).map(([name, logicCells, blockRamBlocks, dsp, reference]) =>
    device(
      "Efinix",
      "Titanium",
      name,
      {
        logicCells,
        logicUnit: "logic elements (vendor equivalent)",
        bramKb: blockRamBlocks * 10,
        blockRamBlocks,
        blockRamBlockKib: 10,
        dsp,
        dspUnit: "Titanium DSP blocks",
        notes:
          "LE count differs from physical XLR cell count. RAM uses 10240-bit blocks; PLL availability depends on package.",
      },
      reference,
    ),
  ),
];

const other = [
  device(
    "Altera",
    "Agilex 3",
    "A3CZ135",
    {
      logicCells: 45800,
      logicUnit: "ALMs",
      bramKb: 7060,
      blockRamBlocks: 353,
      blockRamBlockKib: 20,
      dsp: 368,
      dspUnit: "18 × 19 multipliers",
      notes:
        "The same fabric is marketed as 135,110 equivalent LEs; multiplier count is twice the variable-precision DSP block count.",
    },
    FPGA_RESOURCE_SOURCES.agilex3,
  ),
  device(
    "Altera",
    "Agilex 5 E",
    "A5EC008B",
    {
      logicCells: 28880,
      logicUnit: "ALMs",
      bramKb: 4580,
      blockRamBlocks: 229,
      blockRamBlockKib: 20,
      dsp: 232,
      dspUnit: "18 × 19 multipliers",
      notes:
        "Equivalent to 85,196 vendor LEs. Two 18 × 19 multipliers share each variable-precision DSP block (116 blocks). MLAB is excluded from BRAM.",
    },
    FPGA_RESOURCE_SOURCES.agilex5,
  ),
  device(
    "Anlogic",
    "SALEAGLE 4",
    "EG4S20",
    {
      logicCells: 19600,
      logicUnit: "LUTs (mixed LUT4/LUT5)",
      flipFlops: 19600,
      bramKb: 1088,
      dsp: 29,
      dspUnit: "18 × 18 multipliers",
      pll: 4,
      notes:
        "Mixed RAM inventory: 64 × 9-Kbit and 16 × 32-Kbit blocks. Uses DS301 2.7.6 corrections rather than old v1.4 mirrored data (23,520 LUTs / 3 PLLs). Integrated SDRAM is excluded from BRAM.",
    },
    FPGA_RESOURCE_SOURCES.eagle,
  ),
  device(
    "Anlogic",
    "SALDRAGON 1",
    "DR1V90",
    {
      logicCells: 94464,
      logicUnit: "LUT4 logic resources",
      flipFlops: 104960,
      bramKb: 5600,
      blockRamBlocks: 280,
      blockRamBlockKib: 20,
      dsp: 240,
      dspUnit: "vendor DSP blocks",
      pll: 8,
      notes:
        "Programmable logic resources only; processor caches, TCM, on-chip PS RAM, NPU SRAM and DDR are excluded.",
    },
    FPGA_RESOURCE_SOURCES.dragon,
  ),
  device(
    "Lattice",
    "MachXO3",
    "LCMXO3L-6900",
    {
      logicCells: 6900,
      logicUnit: "LUT4s (nominal)",
      bramKb: 234,
      blockRamBlocks: 26,
      blockRamBlockKib: 9,
      pll: 2,
      notes:
        "26 × 9216-bit EBR primitives give 234 Kibit; the family overview rounds the same capacity to 240 decimal Kbit.",
    },
    FPGA_RESOURCE_SOURCES.machxo3,
  ),
  device(
    "Cologne Chip",
    "GateMate",
    "CCGM1A1",
    {
      logicCells: 20480,
      logicUnit: "CPEs (8-input LUT trees)",
      flipFlops: 40960,
      bramKb: 1280,
      blockRamBlocks: 32,
      blockRamBlockKib: 40,
      pll: 4,
      notes:
        "Each CPE can implement two 4-input LUT trees or an arithmetic tile; arbitrary-size multipliers use CPE fabric, not a fixed DSP-block inventory.",
    },
    FPGA_RESOURCE_SOURCES.gatemate,
  ),
  device(
    "QuickLogic",
    "EOS S3",
    "QL-EOS-S3",
    {
      logicCells: 2400,
      logicUnit: "effective logic cells",
      bramKb: 64,
      notes:
        "FPGA fabric RAM only; the processor's 512-KB SRAM is not FPGA block RAM.",
    },
    FPGA_RESOURCE_SOURCES.eos3,
  ),
  device(
    "Lattice",
    "CrossLink-NX",
    "LIFCL-40",
    {
      logicCells: 39000,
      logicUnit: "logic cells (nominal)",
      bramKb: 1512,
      blockRamBlocks: 84,
      blockRamBlockKib: 18,
      largeRamKb: 1024,
      dsp: 56,
      dspUnit: "18 × 18 multipliers",
      pll: 3,
    },
    FPGA_RESOURCE_SOURCES.crosslink,
  ),
  device(
    "Microchip",
    "IGLOO2",
    "M2GL010",
    {
      logicCells: 12084,
      logicUnit: "logic elements (LUT4 + FF)",
      bramKb: 378,
      blockRamBlocks: 21,
      blockRamBlockKib: 18,
      dsp: 22,
      dspUnit: "18 × 18 math blocks",
      notes: "Fabric LSRAM only; µSRAM, eSRAM and NVM are excluded.",
    },
    FPGA_RESOURCE_SOURCES.igloo2,
  ),
  ...(
    [
      ["MPF100T", 109000, 352, 336],
      ["MPF300T", 300000, 952, 924],
    ] as const
  ).map(([name, logicCells, blockRamBlocks, dsp]) =>
    device(
      "Microchip",
      "PolarFire",
      name,
      {
        logicCells,
        logicUnit: "logic elements (nominal LUT4 + FF)",
        bramKb: blockRamBlocks * 20,
        blockRamBlocks,
        blockRamBlockKib: 20,
        dsp,
        dspUnit: "18 × 18 MACC blocks",
        pll: 8,
        notes:
          "LSRAM only; µSRAM, µPROM and processor memories are separate resources.",
      },
      FPGA_RESOURCE_SOURCES.polarfire,
    ),
  ),
];

/** Package-independent profiles. Resolve board/package aliases with getFpgaForBoard. */
export const FPGAS: FpgaDevice[] = [
  ...ice40,
  ...ecp5,
  ...amd7,
  ...spartan6,
  ...cyclone10,
  ...cyclone4,
  cyclone4gx,
  ...cyclone5,
  cyclone3,
  ...max10,
  ...zynq7000,
  ...ultrascale,
  ...amdModules,
  ...gowin,
  ...efinix,
  ...other,
];
const profilesByNameLength = [...FPGAS].sort(
  (left, right) => right.device.length - left.device.length,
);
// Package availability, from the ordering-code tables cited by each Efinix
// profile. Unlisted packages stay unknown instead of inheriting a family maximum.
const packagePllCounts: Array<[string, number]> = [
  ["T8F49", 1],
  ["T8F81", 1],
  ["T120F324", 7],
  ["T120F484", 8],
  ["T120F576", 8],
  ["TI60W64", 2],
  ["TI60V64", 2],
  ["TI60F100", 3],
  ["TI60F225", 4],
  ["TI60F256", 4],
  ["TI375N484", 9],
  ["TI375C529", 12],
  ["TI375N900", 12],
  ["TI375N1156", 12],
];

function normalized(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Resolve an identified silicon part only. Never guess a density from a family name. */
export function getFpgaById(id: string): FpgaDevice | undefined {
  const value = normalized(id);
  // The LiteX HX8K-TQ144 platform explicitly exposes the 4K-compatible density.
  if (/ICE40HX8KTQ1444K/.test(value))
    return FPGAS.find((profile) => profile.device === "iCE40HX4K");
  const gowinMatch = value.match(/^(GW\d[A-Z]*?)(?:LV|UV)?(\d+(?:P\d+)?)(C)?/);
  const gowinAlias = gowinMatch
    ? `${gowinMatch[1]}${gowinMatch[2]}${gowinMatch[3] ?? ""}`
    : undefined;
  // Match the longest silicon name first: LX45T must not resolve to LX45.
  return profilesByNameLength.find((profile) => {
    const key = normalized(profile.device);
    if (key.startsWith("GW"))
      return gowinAlias === key || gowinAlias?.replace(/C$/, "") === key;
    const separatedSuffix = id
      .toUpperCase()
      .startsWith(`${profile.device.toUpperCase()}-`);
    return (
      value.startsWith(key) &&
      (separatedSuffix || !/\d/.test(value[key.length] ?? ""))
    );
  });
}

export function getFpgaForBoard(
  board: Pick<
    BoardDefinition,
    "device" | "fpgaId" | "package" | "identityUnresolved"
  >,
): FpgaDevice | undefined {
  if (board.identityUnresolved) return undefined;
  const profile = getFpgaById(board.fpgaId) ?? getFpgaById(board.device);
  if (!profile) return undefined;
  const part = normalized(board.fpgaId);
  const pll =
    profile.device === "GW2AR-18" && part.includes("QN88")
      ? 2
      : (packagePllCounts.find(([prefix]) => part.startsWith(prefix))?.[1] ??
        profile.pll);
  return {
    ...profile,
    id: board.fpgaId,
    device: board.device,
    package: board.package,
    pll,
  };
}
