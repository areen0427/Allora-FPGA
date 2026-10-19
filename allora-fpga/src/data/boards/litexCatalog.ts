import type {
  BoardDefinition,
  BoardGroupDefinition,
  BoardPin,
  ConstraintFile,
  SynthesisFlow,
} from "../boardTypes";

import { getVerifiedPlatform } from "./verifiedPlatformData";
import { normalizeCatalogIdentity } from "./catalogIdentity";

type PinSpec = [
  string,
  string,
  string,
  BoardPin["type"],
  string,
  boolean?,
  string?,
];

type CatalogBoardSpec = {
  id: string;
  name: string;
  vendor: string;
  family: string;
  device: string;
  packageName: string;
  fpgaId: string;
  constraintsFile: ConstraintFile;
  synthesisFlow: SynthesisFlow;
  toolchain: string;
  program: string;
  clock: {
    name: string;
    pin?: string;
    frequency: number;
    ioStandard?: string;
    source?: "external" | "internal-hfosc";
  };
  additionalClocks?: CatalogBoardSpec["clock"][];
  pins: PinSpec[];
  source: string;
  notes?: string;
  identityUnresolved?: boolean;
};

function toPin([
  name,
  signal,
  pin,
  type,
  group,
  activeLow,
  ioStandard,
]: PinSpec): BoardPin {
  return {
    name,
    signal,
    pin,
    type,
    group,
    activeLow,
    ioStandard,
    verified: true,
  };
}

function makeCatalogBoard(spec: CatalogBoardSpec): BoardDefinition {
  const evidence = getVerifiedPlatform(spec.source);
  // Use the complete revision-selected resource set, not the old summarized import.
  const pins = evidence?.pins.length ? evidence.pins : spec.pins.map(toPin).map(pin => ({ ...pin, verified: false }));
  const primaryClock = evidence?.clock;
  const sourceUrl = evidence?.source.url;
  const fallbackClock = { ...spec.clock, sourceUrl, verified: spec.clock.source === "internal-hfosc" };
  const clocks = primaryClock ? [primaryClock, ...(evidence?.additionalClocks ?? [])] : [fallbackClock];
  if (spec.clock.source === "internal-hfosc") clocks.splice(0, clocks.length, fallbackClock);
  // Additional clocks require their own source frequency; never attach the default period to another pad.
  for (const clock of spec.additionalClocks ?? []) {
    if (!clocks.some(item => item.name === clock.name)) clocks.push({ ...clock, sourceUrl, verified: false });
  }
  return normalizeCatalogIdentity({
    id: spec.id,
    name: spec.name,
    vendor: spec.vendor,
    family: spec.family,
    device: spec.device,
    package: spec.packageName,
    fpgaId: spec.fpgaId,
    constraintsFile: spec.constraintsFile,
    synthesisFlow: spec.synthesisFlow,
    toolchain: {
      synth: spec.toolchain,
      placeRoute: spec.toolchain,
      program: spec.program,
    },
    clocks,
    pins,
    leds: pins.filter((pin, index) => pin.type === "led" && pins.findIndex(item => item.type === "led" && item.pin === pin.pin) === index),
    buttons: pins.filter((pin, index) => pin.type === "button" && pins.findIndex(item => item.type === "button" && item.pin === pin.pin) === index),
    sources: evidence ? [evidence.source] : [],
    verificationNotes: [...(evidence?.notes ?? []), ...(!evidence?.pins.length ? ["Base resource declarations could not be resolved for this platform; legacy mappings require verification."] : [])],
    notes: `Published LiteX resource mapping (${evidence?.declaration ?? "unresolved base declaration"}). Catalog data is source evidence, not a connected-hardware test.${spec.notes ? ` ${spec.notes}` : ""}`,
    identityUnresolved: spec.identityUnresolved,
  });
}

const LITEX_CATALOG_SPECS: CatalogBoardSpec[] = [
  {
    "id": "sitlinv-a-e115fb",
    "name": "SITLINV A-E115FB",
    "vendor": "SITLINV",
    "family": "Cyclone",
    "device": "EP4CE115F23I7",
    "packageName": "F23",
    "fpgaId": "ep4ce115f23i7",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "sitlinv_a_e115fb",
    "clock": {
      "name": "clk27",
      "pin": "A11",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "sitlinv-stlv7325-v1",
    "name": "SITLINV STLV7325 V1",
    "vendor": "SITLINV",
    "family": "Kintex-7",
    "device": "XC7K325T",
    "packageName": "FFG676",
    "fpgaId": "xc7k325t-ffg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "sitlinv_stlv7325_v1",
    "clock": {
      "name": "clk100",
      "pin": "F17",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "sitlinv-stlv7325-v2",
    "name": "SITLINV STLV7325 V2",
    "vendor": "SITLINV",
    "family": "Kintex-7",
    "device": "XC7K325T",
    "packageName": "FFG676",
    "fpgaId": "xc7k325t-ffg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "sitlinv_stlv7325_v2",
    "clock": {
      "name": "clk50",
      "pin": "F17",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "sitlinv-xc7k420t",
    "name": "SITLINV XC7K420T",
    "vendor": "SITLINV",
    "family": "Kintex-7",
    "device": "XC7K420T",
    "packageName": "FFG901",
    "fpgaId": "xc7k420t-ffg901-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "sitlinv_xc7k420t",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "sqrl-xcu1525",
    "name": "SQRL XCU1525",
    "vendor": "SQRL",
    "family": "UltraScale+",
    "device": "XCVU9P",
    "packageName": "FSGD2104",
    "fpgaId": "xcvu9p-fsgd2104-2l-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "sqrl_xcu1525",
    "clock": {
      "name": "clk300",
      "pin": "AW19",
      "frequency": 300000000
    },
    "pins": []
  },
  {
    "id": "terasic-atum-a3-nano",
    "name": "Terasic Atum A3 Nano",
    "vendor": "Terasic",
    "family": "Cyclone V",
    "device": "A3CZ135BB18AE7S",
    "packageName": "BB18",
    "fpgaId": "a3cz135bb18ae7s",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "terasic_atum_a3_nano",
    "clock": {
      "name": "clk50_1",
      "pin": "A8",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "terasic-de0nano",
    "name": "Terasic DE0-Nano",
    "vendor": "Terasic",
    "family": "Cyclone",
    "device": "EP4CE22F17C6",
    "packageName": "F17",
    "fpgaId": "ep4ce22f17c6",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "terasic_de0nano",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "terasic-de1soc",
    "name": "Terasic DE1-SoC",
    "vendor": "Terasic",
    "family": "Cyclone V",
    "device": "5CSEMA5F31C6",
    "packageName": "F31",
    "fpgaId": "5csema5f31c6",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "terasic_de1soc",
    "clock": {
      "name": "clk50",
      "pin": "AA16",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "terasic-de2-115",
    "name": "Terasic DE2-115",
    "vendor": "Terasic",
    "family": "Cyclone",
    "device": "EP4CE115F29C7",
    "packageName": "F29",
    "fpgaId": "ep4ce115f29c7",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "terasic_de2_115",
    "clock": {
      "name": "clk25",
      "pin": "A14",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "terasic-de10lite",
    "name": "Terasic DE10-Lite",
    "vendor": "Terasic",
    "family": "MAX 10",
    "device": "10M50DAF484C7G",
    "packageName": "DAF484",
    "fpgaId": "10m50daf484c7g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "terasic_de10lite",
    "clock": {
      "name": "clk50",
      "pin": "P11",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "terasic-de10nano",
    "name": "Terasic DE10-Nano",
    "vendor": "Terasic",
    "family": "Cyclone V",
    "device": "5CSEBA6U23I7",
    "packageName": "U23",
    "fpgaId": "5cseba6u23i7",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "terasic_de10nano",
    "clock": {
      "name": "clk50",
      "pin": "Y13",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "terasic-deca",
    "name": "Terasic DECA",
    "vendor": "Terasic",
    "family": "MAX 10",
    "device": "10M50DAF484C6GES",
    "packageName": "DAF484",
    "fpgaId": "10m50daf484c6ges",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "terasic_deca",
    "clock": {
      "name": "clk50",
      "pin": "M8",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "terasic-sockit",
    "name": "Terasic SoCKit",
    "vendor": "Terasic",
    "family": "Cyclone V",
    "device": "5CSXFC6D6F31C8ES",
    "packageName": "F31",
    "fpgaId": "5csxfc6d6f31c8es",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "terasic_sockit",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "trenz-c10lpek",
    "name": "Trenz C10LPEK",
    "vendor": "Trenz Electronic",
    "family": "Cyclone",
    "device": "10CL025YU256I7G",
    "packageName": "YU256",
    "fpgaId": "10cl025yu256i7g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "trenz_c10lpek",
    "clock": {
      "name": "clk50",
      "pin": "E1",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "trenz-c10lprefkit",
    "name": "Trenz C10LP RefKit",
    "vendor": "Trenz Electronic",
    "family": "Cyclone",
    "device": "10CL055YU484A7G",
    "packageName": "YU484",
    "fpgaId": "10cl055yu484a7g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "trenz_c10lprefkit",
    "clock": {
      "name": "clk25",
      "pin": "AA12",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "trenz-cr00010",
    "name": "Trenz CR00010",
    "vendor": "Trenz Electronic",
    "family": "MAX 10",
    "device": "10M08SAU169C8G",
    "packageName": "SAU169",
    "fpgaId": "10m08sau169c8g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "trenz_cr00010",
    "clock": {
      "name": "clk12",
      "pin": "H6",
      "frequency": 12048193
    },
    "pins": []
  },
  {
    "id": "trenz-cyc1000",
    "name": "Trenz CYC1000",
    "vendor": "Trenz Electronic",
    "family": "Cyclone",
    "device": "10CL025YU256C8G",
    "packageName": "YU256",
    "fpgaId": "10cl025yu256c8g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "trenz_cyc1000",
    "clock": {
      "name": "clk12",
      "pin": "unknown",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "trenz-max1000",
    "name": "Trenz MAX1000",
    "vendor": "Trenz Electronic",
    "family": "MAX 10",
    "device": "10M08SAU169C8G",
    "packageName": "SAU169",
    "fpgaId": "10m08sau169c8g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "trenz_max1000",
    "clock": {
      "name": "clk12",
      "pin": "unknown",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "trenz-mega65",
    "name": "Trenz MEGA65",
    "vendor": "Trenz Electronic",
    "family": "Artix-7",
    "device": "XC7A200TFBG484",
    "packageName": "1",
    "fpgaId": "xc7a200tfbg484-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "trenz_mega65",
    "clock": {
      "name": "eth_clocks",
      "pin": "L4",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "trenz-mf-c10lp-001",
    "name": "Trenz MF C10LP 001",
    "vendor": "Trenz Electronic",
    "family": "Cyclone",
    "device": "10CL025YU256I7G",
    "packageName": "YU256",
    "fpgaId": "10cl025yu256i7g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "trenz_mf_c10lp_001",
    "clock": {
      "name": "sys_clk",
      "pin": "unknown",
      "frequency": 80000000
    },
    "pins": []
  },
  {
    "id": "trenz-mf-max10-001",
    "name": "Trenz MF MAX10 001",
    "vendor": "Trenz Electronic",
    "family": "MAX 10",
    "device": "10M08SAU169C8G",
    "packageName": "SAU169",
    "fpgaId": "10m08sau169c8g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "trenz_mf_max10_001",
    "clock": {
      "name": "sys_clk",
      "pin": "unknown",
      "frequency": 116000000
    },
    "pins": []
  },
  {
    "id": "trenz-mf001-intel",
    "name": "Trenz MF001 Intel",
    "vendor": "Trenz Electronic",
    "family": "MAX 10",
    "device": "10M08SAU169C8G",
    "packageName": "SAU169",
    "fpgaId": "10m08sau169c8g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "trenz_mf001_intel",
    "clock": {
      "name": "sys_clk",
      "pin": "unknown",
      "frequency": 116000000
    },
    "pins": []
  },
  {
    "id": "trenz-s7mini",
    "name": "Trenz S7 Mini",
    "vendor": "Trenz Electronic",
    "family": "Spartan-7",
    "device": "XC7S25CSGA225",
    "packageName": "2",
    "fpgaId": "xc7s25csga225-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "trenz_s7mini",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "trenz-smf2000",
    "name": "Trenz SMF2000",
    "vendor": "Trenz Electronic",
    "family": "Microchip FPGA",
    "device": "M2GL010-1VF400",
    "packageName": "VF400",
    "fpgaId": "m2gl010-1vf400",
    "constraintsFile": "pdc",
    "synthesisFlow": "microchip",
    "toolchain": "libero",
    "program": "libero",
    "source": "trenz_smf2000",
    "clock": {
      "name": "clk12",
      "pin": "N16",
      "frequency": 12048193
    },
    "pins": []
  },
  {
    "id": "trenz-te0710",
    "name": "Trenz TE0710",
    "vendor": "Trenz Electronic",
    "family": "Artix-7",
    "device": "XC7A200TSBG484",
    "packageName": "2",
    "fpgaId": "xc7a200tsbg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "trenz_te0710",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "trenz-te0711",
    "name": "Trenz TE0711",
    "vendor": "Trenz Electronic",
    "family": "Artix-7",
    "device": "XC7A35TCSG324",
    "packageName": "2",
    "fpgaId": "xc7a35tcsg324-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "trenz_te0711",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "trenz-te0725",
    "name": "Trenz TE0725",
    "vendor": "Trenz Electronic",
    "family": "Artix-7",
    "device": "XC7A35TCSG324",
    "packageName": "2",
    "fpgaId": "xc7a35tcsg324-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "trenz_te0725",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "trenz-te0741",
    "name": "Trenz TE0741",
    "vendor": "Trenz Electronic",
    "family": "Artix-7",
    "device": "XC7A200TFBG484",
    "packageName": "2",
    "fpgaId": "xc7a200tfbg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "trenz_te0741",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "trenz-te0890",
    "name": "Trenz TE0890",
    "vendor": "Trenz Electronic",
    "family": "Spartan-7",
    "device": "XC7S25FTGB196",
    "packageName": "1",
    "fpgaId": "xc7s25ftgb196-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "trenz_te0890",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "trenz-tec0117",
    "name": "Trenz TEC0117",
    "vendor": "Trenz Electronic",
    "family": "Gowin",
    "device": "GW1NR-LV9QN88C6/I5",
    "packageName": "QN88",
    "fpgaId": "gw1nr-lv9qn88c6/i5",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "trenz_tec0117",
    "clock": {
      "name": "clk100",
      "pin": "63",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "trenz-tem0006",
    "name": "Trenz TEM0006",
    "vendor": "Trenz Electronic",
    "family": "Microchip FPGA",
    "device": "MPF100T-1FCVG484",
    "packageName": "FCVG484",
    "fpgaId": "mpf100t-1fcvg484",
    "constraintsFile": "pdc",
    "synthesisFlow": "microchip",
    "toolchain": "libero",
    "program": "libero",
    "source": "trenz_tem0006",
    "clock": {
      "name": "clk12",
      "pin": "A2",
      "frequency": 12048193
    },
    "pins": []
  },
  {
    "id": "tul-pynq-z2",
    "name": "TUL PYNQ-Z2",
    "vendor": "TUL",
    "family": "Zynq-7000",
    "device": "XC7Z020CLG400",
    "packageName": "1",
    "fpgaId": "xc7z020clg400-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "tul_pynq_z2",
    "clock": {
      "name": "clk125",
      "pin": "unknown",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "xilinx-alveo-u200",
    "name": "Xilinx Alveo U200",
    "vendor": "Xilinx",
    "family": "UltraScale+",
    "device": "XCU200",
    "packageName": "FSGD2104",
    "fpgaId": "xcu200-fsgd2104-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_alveo_u200",
    "clock": {
      "name": "clk300",
      "pin": "AW19",
      "frequency": 300000000
    },
    "pins": []
  },
  {
    "id": "xilinx-alveo-u250",
    "name": "Xilinx Alveo U250",
    "vendor": "Xilinx",
    "family": "UltraScale+",
    "device": "XCU250",
    "packageName": "FIGD2104",
    "fpgaId": "xcu250-figd2104-2l-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_alveo_u250",
    "clock": {
      "name": "clk300",
      "pin": "AW19",
      "frequency": 300000000
    },
    "pins": []
  },
  {
    "id": "xilinx-alveo-u280",
    "name": "Xilinx Alveo U280",
    "vendor": "Xilinx",
    "family": "UltraScale+",
    "device": "XCU280",
    "packageName": "FSVH2892",
    "fpgaId": "xcu280-fsvh2892-2l-e-es1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_alveo_u280",
    "clock": {
      "name": "sysclk",
      "pin": "BJ6",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "xilinx-kc705",
    "name": "Xilinx KC705",
    "vendor": "Xilinx",
    "family": "Kintex-7",
    "device": "XC7K325T",
    "packageName": "FFG900",
    "fpgaId": "xc7k325t-ffg900-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_kc705",
    "clock": {
      "name": "clk156",
      "pin": "K28",
      "frequency": 156250000
    },
    "pins": []
  },
  {
    "id": "xilinx-kcu105",
    "name": "Xilinx KCU105",
    "vendor": "Xilinx",
    "family": "UltraScale+",
    "device": "XCKU040",
    "packageName": "FFVA1156",
    "fpgaId": "xcku040-ffva1156-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_kcu105",
    "clock": {
      "name": "clk300",
      "pin": "AK17",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "xilinx-kcu116",
    "name": "Xilinx KCU116",
    "vendor": "Xilinx",
    "family": "UltraScale+",
    "device": "XCKU5P",
    "packageName": "FFVB676",
    "fpgaId": "xcku5p-ffvb676-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_kcu116",
    "clock": {
      "name": "clk125",
      "pin": "G12",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "xilinx-kv260",
    "name": "Xilinx KV260",
    "vendor": "Xilinx",
    "family": "UltraScale+",
    "device": "XCK26",
    "packageName": "SFVC784",
    "fpgaId": "xck26-sfvc784-2lv-c",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_kv260",
    "clock": {
      "name": "pmod_hda16_cc",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "xilinx-sp605",
    "name": "Xilinx SP605",
    "vendor": "Xilinx",
    "family": "Spartan-6",
    "device": "XC6SLX45T",
    "packageName": "FGG484",
    "fpgaId": "xc6slx45t-fgg484-3",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_sp605",
    "clock": {
      "name": "clk27",
      "pin": "AB13",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "xilinx-vc707",
    "name": "Xilinx VC707",
    "vendor": "Xilinx",
    "family": "Virtex-7",
    "device": "XC7VX485TFFG1761",
    "packageName": "2",
    "fpgaId": "xc7vx485tffg1761-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_vc707",
    "clock": {
      "name": "clk156",
      "pin": "AK34",
      "frequency": 156250000
    },
    "pins": []
  },
  {
    "id": "xilinx-vcu118",
    "name": "Xilinx VCU118",
    "vendor": "Xilinx",
    "family": "UltraScale+",
    "device": "XCVU9P",
    "packageName": "FLGA2104",
    "fpgaId": "xcvu9p-flga2104-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_vcu118",
    "clock": {
      "name": "clk250",
      "pin": "E12",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "xilinx-vcu128",
    "name": "Xilinx VCU128",
    "vendor": "Xilinx",
    "family": "UltraScale+",
    "device": "XCVU37P",
    "packageName": "FSVH2892",
    "fpgaId": "xcvu37p-fsvh2892-2l-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_vcu128",
    "clock": {
      "name": "clk100_qdr4",
      "pin": "BJ4",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "xilinx-zc706",
    "name": "Xilinx ZC706",
    "vendor": "Xilinx",
    "family": "Zynq-7000",
    "device": "XC7Z045FFG900",
    "packageName": "2",
    "fpgaId": "xc7z045ffg900-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_zc706",
    "clock": {
      "name": "user_sma_clock_p",
      "pin": "AD18",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "xilinx-zcu102",
    "name": "Xilinx ZCU102",
    "vendor": "Xilinx",
    "family": "Zynq UltraScale+",
    "device": "XCZU9EG",
    "packageName": "FFVB1156",
    "fpgaId": "xczu9eg-ffvb1156-2-i",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_zcu102",
    "clock": {
      "name": "clk300",
      "pin": "AL8",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "xilinx-zcu104",
    "name": "Xilinx ZCU104",
    "vendor": "Xilinx",
    "family": "Zynq UltraScale+",
    "device": "XCZU7EV",
    "packageName": "FFVC1156",
    "fpgaId": "xczu7ev-ffvc1156-2-i",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_zcu104",
    "clock": {
      "name": "clk300",
      "pin": "AH18",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "xilinx-zcu106",
    "name": "Xilinx ZCU106",
    "vendor": "Xilinx",
    "family": "Zynq UltraScale+",
    "device": "XCZU7EV",
    "packageName": "FFVC1156",
    "fpgaId": "xczu7ev-ffvc1156-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_zcu106",
    "clock": {
      "name": "clk125",
      "pin": "H9",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "xilinx-zcu216",
    "name": "Xilinx ZCU216",
    "vendor": "Xilinx",
    "family": "Zynq UltraScale+",
    "device": "XCZU49DR",
    "packageName": "FFVF1760",
    "fpgaId": "xczu49dr-ffvf1760-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "xilinx_zcu216",
    "clock": {
      "name": "clk100",
      "pin": "G12",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "ypcb-00338-1p1",
    "name": "YPCB 00338 1.1",
    "vendor": "YPCB",
    "family": "Kintex-7",
    "device": "XC7K480T",
    "packageName": "FFG1156",
    "fpgaId": "xc7k480t-ffg1156-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "ypcb_00338_1p1",
    "clock": {
      "name": "clk200",
      "pin": "AH27",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "ztex213",
    "name": "ZTEX 2.13",
    "vendor": "ZTEX",
    "family": "Artix-7",
    "device": "XC7A35TCSG324",
    "packageName": "1",
    "fpgaId": "xc7a35tcsg324-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "ztex213",
    "clock": {
      "name": "clk48",
      "pin": "unknown",
      "frequency": 48000000
    },
    "pins": []
  },
  {
    "id": "adi-adrv2crr-fmc",
    "name": "ADI ADRV2CRR-FMC",
    "vendor": "ADI",
    "family": "Zynq UltraScale+",
    "device": "XCZU11EG",
    "packageName": "FFVF1517",
    "fpgaId": "xczu11eg-ffvf1517-2-i",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "adi_adrv2crr_fmc",
    "clock": {
      "name": "clk122m88",
      "pin": "unknown",
      "frequency": 122880000
    },
    "pins": []
  },
  {
    "id": "adi-plutosdr",
    "name": "ADI PlutoSDR",
    "vendor": "ADI",
    "family": "Zynq-7000",
    "device": "XC7Z010CLG225",
    "packageName": "1",
    "fpgaId": "xc7z010clg225-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "adi_plutosdr",
    "clock": {
      "name": "clk",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "alchitry-au-v2",
    "name": "Alchitry Au V2",
    "vendor": "Alchitry",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alchitry_au_v2",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "alchitry-au",
    "name": "Alchitry Au",
    "vendor": "Alchitry",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alchitry_au",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "alchitry-cu",
    "name": "Alchitry Cu V1",
    "vendor": "Alchitry",
    "family": "iCE40 HX",
    "device": "iCE40HX8KCB132",
    "packageName": "CB132",
    "fpgaId": "ice40-hx8k-cb132",
    "constraintsFile": "pcf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "iceprog",
    "source": "alchitry_cu",
    "clock": {
      "name": "clk100",
      "pin": "P7",
      "frequency": 100000000
    },
    "pins": [],
    "notes": "Alchitry Cu V1 pin names and pads match the maker's CuPin definitions. Package is CB132; clock frequency and the iceprog programming path still need a connected-board check. Published pins have not been physically tested in Allora."
  },
  {
    "id": "alchitry-mojo",
    "name": "Alchitry Mojo",
    "vendor": "Alchitry",
    "family": "Spartan-6",
    "device": "XC6SLX9",
    "packageName": "2",
    "fpgaId": "xc6slx9-2-tqg144",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alchitry_mojo",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "alchitry-pt-v2",
    "name": "Alchitry Pt V2",
    "vendor": "Alchitry",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alchitry_pt_v2",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "alibaba-vu13p",
    "name": "Alibaba VU13P",
    "vendor": "Alibaba",
    "family": "UltraScale+",
    "device": "XCVU13P",
    "packageName": "FHGB2104",
    "fpgaId": "xcvu13p-fhgb2104-2l-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alibaba_vu13p",
    "clock": {
      "name": "clk400",
      "pin": "AY22",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "alibaba-xcku3p",
    "name": "Alibaba XCKU3P",
    "vendor": "Alibaba",
    "family": "UltraScale+",
    "device": "XCKU3P",
    "packageName": "FFVB676",
    "fpgaId": "xcku3p-ffvb676-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alibaba_xcku3p",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "alientek-davincipro",
    "name": "ALIENTEK Davinci Pro",
    "vendor": "ALIENTEK",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alientek_davincipro",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "aliexpress-xc7k70t",
    "name": "AliExpress XC7K70T",
    "vendor": "AliExpress",
    "family": "Kintex-7",
    "device": "XC7K70T",
    "packageName": "FBG676",
    "fpgaId": "xc7k70t-fbg676-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "aliexpress_xc7k70t",
    "clock": {
      "name": "sma_global_clock",
      "pin": "C12",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "aliexpress-xc7k420t",
    "name": "AliExpress XC7K420T",
    "vendor": "AliExpress",
    "family": "Kintex-7",
    "device": "XC7K420TL",
    "packageName": "FFG901",
    "fpgaId": "xc7k420tl-ffg901",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "aliexpress_xc7k420t",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "alinx-ax7010",
    "name": "ALINX AX7010",
    "vendor": "ALINX",
    "family": "Zynq-7000",
    "device": "XC7Z010CLG400",
    "packageName": "1",
    "fpgaId": "xc7z010clg400-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alinx_ax7010",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "alinx-ax7020",
    "name": "ALINX AX7020",
    "vendor": "ALINX",
    "family": "Zynq-7000",
    "device": "XC7Z020CLG400",
    "packageName": "2",
    "fpgaId": "xc7z020clg400-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alinx_ax7020",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "alinx-ax7203",
    "name": "ALINX AX7203",
    "vendor": "ALINX",
    "family": "Artix-7",
    "device": "XC7A200T",
    "packageName": "FBG484",
    "fpgaId": "xc7a200t-fbg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alinx_ax7203",
    "clock": {
      "name": "clk148p5",
      "pin": "F6",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "alinx-axau15",
    "name": "ALINX AXAU15",
    "vendor": "ALINX",
    "family": "FPGA",
    "device": "XCAU15P-FFVB676-2-I",
    "packageName": "unknown",
    "fpgaId": "xcau15p-ffvb676-2-i",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alinx_axau15",
    "clock": {
      "name": "clk156p25",
      "pin": "T7",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "alinx-axu2cga",
    "name": "ALINX AXU2CGA",
    "vendor": "ALINX",
    "family": "Zynq UltraScale+",
    "device": "XCZU2CG",
    "packageName": "SFVC784",
    "fpgaId": "xczu2cg-sfvc784-1-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "alinx_axu2cga",
    "clock": {
      "name": "clk25",
      "pin": "unknown",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "altera-agilex5e-065b-premium-devkit",
    "name": "Altera Agilex 5E 065B Premium DevKit",
    "vendor": "Altera",
    "family": "Cyclone",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "altera_agilex5e_065b_premium_devkit",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "analog-pocket",
    "name": "Analogue Pocket",
    "vendor": "Analogue",
    "family": "Cyclone",
    "device": "5CEBA4F23C8",
    "packageName": "unknown",
    "fpgaId": "5ceba4f23c8",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "analog_pocket",
    "clock": {
      "name": "clk74a",
      "pin": "unknown",
      "frequency": 74250000
    },
    "pins": []
  },
  {
    "id": "antmicro-artix-dc-scm",
    "name": "Antmicro Artix DC-SCM",
    "vendor": "Antmicro",
    "family": "Artix-7",
    "device": "XC7A100TFGG484",
    "packageName": "1",
    "fpgaId": "xc7a100tfgg484-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "antmicro_artix_dc_scm",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "antmicro-datacenter-ddr4-test-board",
    "name": "Antmicro Datacenter DDR4 Test Board",
    "vendor": "Antmicro",
    "family": "Kintex-7",
    "device": "XC7K160TFFG676",
    "packageName": "1",
    "fpgaId": "xc7k160tffg676-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "antmicro_datacenter_ddr4_test_board",
    "clock": {
      "name": "clk100",
      "pin": "C12",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "antmicro-lpddr4-test-board",
    "name": "Antmicro LPDDR4 Test Board",
    "vendor": "Antmicro",
    "family": "Kintex-7",
    "device": "XC7K70TFBG484",
    "packageName": "1",
    "fpgaId": "xc7k70tfbg484-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "antmicro_lpddr4_test_board",
    "clock": {
      "name": "clk100",
      "pin": "L19",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "antmicro-sdi-mipi-video-converter",
    "name": "Antmicro Sdi Mipi Video Converter",
    "vendor": "Antmicro",
    "family": "Lattice Nexus",
    "device": "LIFCL-40-9BG256C",
    "packageName": "unknown",
    "fpgaId": "lifcl-40-9bg256c",
    "constraintsFile": "pdc",
    "synthesisFlow": "radiant",
    "toolchain": "radiant",
    "program": "radiant",
    "source": "antmicro_sdi_mipi_video_converter",
    "clock": {
      "name": "clk40",
      "pin": "unknown",
      "frequency": 40000000
    },
    "pins": []
  },
  {
    "id": "arduino-mkrvidor4000",
    "name": "Arduino MKR Vidor 4000",
    "vendor": "Arduino",
    "family": "Cyclone",
    "device": "10CL016YU256C8G",
    "packageName": "YU256",
    "fpgaId": "10cl016yu256c8g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "arduino_mkrvidor4000",
    "clock": {
      "name": "clk48",
      "pin": "unknown",
      "frequency": 48000000
    },
    "pins": []
  },
  {
    "id": "arrow-axe5000",
    "name": "Arrow AXE5000",
    "vendor": "Arrow",
    "family": "Cyclone",
    "device": "A5EC008BM16AE6S",
    "packageName": "unknown",
    "fpgaId": "a5ec008bm16ae6s",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "arrow_axe5000",
    "clock": {
      "name": "clk25",
      "pin": "unknown",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "avalanche",
    "name": "Avalanche",
    "vendor": "Avalanche",
    "family": "Microchip FPGA",
    "device": "MPF300TS_ES-1FCG484",
    "packageName": "unknown",
    "fpgaId": "mpf300ts_es-1fcg484",
    "constraintsFile": "pdc",
    "synthesisFlow": "microchip",
    "toolchain": "libero",
    "program": "libero",
    "source": "avalanche",
    "clock": {
      "name": "clk50",
      "pin": "J3",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "avnet-aesku40",
    "name": "Avnet AES-KU040",
    "vendor": "Avnet",
    "family": "UltraScale+",
    "device": "XCKU040",
    "packageName": "FBVA676",
    "fpgaId": "xcku040-fbva676-1-c",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "avnet_aesku40",
    "clock": {
      "name": "clk250",
      "pin": "unknown",
      "frequency": 250000000
    },
    "pins": []
  },
  {
    "id": "berkeleylab-marble",
    "name": "Berkeley Lab Marble",
    "vendor": "Berkeley Lab",
    "family": "Kintex-7",
    "device": "XC7K160T",
    "packageName": "FFG676",
    "fpgaId": "xc7k160t-ffg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "berkeleylab_marble",
    "clock": {
      "name": "eth_clocks",
      "pin": "F10",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "berkeleylab-marblemini",
    "name": "Berkeley Lab Marble Mini",
    "vendor": "Berkeley Lab",
    "family": "Artix-7",
    "device": "XC7A100T",
    "packageName": "2FGG484",
    "fpgaId": "xc7a100t-2fgg484",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "berkeleylab_marblemini",
    "clock": {
      "name": "clk20_vcxo_en",
      "pin": "E13",
      "frequency": 20000000
    },
    "pins": []
  },
  {
    "id": "berkeleylab-obsidian",
    "name": "Berkeley Lab Obsidian",
    "vendor": "Berkeley Lab",
    "family": "Artix-7",
    "device": "XC7A35T",
    "packageName": "CSG325",
    "fpgaId": "xc7a35t-csg325",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "berkeleylab_obsidian",
    "clock": {
      "name": "eth_clocks",
      "pin": "D15",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "bochenjingxin-kintex7-basec",
    "name": "Bochenjingxin KINTEX7 Basec",
    "vendor": "Bochenjingxin",
    "family": "Kintex-7",
    "device": "XC7K325TFFG676",
    "packageName": "2",
    "fpgaId": "xc7k325tffg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "bochenjingxin_kintex7_basec",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "brisbane-silicon-brs-100-gw1nr9",
    "name": "Brisbane Silicon BRS-100 GW1NR9",
    "vendor": "Brisbane Silicon",
    "family": "Gowin",
    "device": "GW1NR-LV9QN88PC7/I6",
    "packageName": "QN88",
    "fpgaId": "gw1nr-lv9qn88pc7/i6",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "brisbaneSilicon_brs_100_gw1nr9",
    "clock": {
      "name": "clk27",
      "pin": "unknown",
      "frequency": 27000000
    },
    "pins": []
  },
  {
    "id": "camlink-4k",
    "name": "Cam Link 4K",
    "vendor": "Camlink",
    "family": "ECP5",
    "device": "LFE5U-25F",
    "packageName": "CABGA381",
    "fpgaId": "lfe5u-25f-cabga381",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "openFPGALoader",
    "source": "camlink_4k",
    "clock": {
      "name": "clk27",
      "pin": "B11",
      "frequency": 27000000
    },
    "pins": []
  },
  {
    "id": "colognechip-gatemate-evb",
    "name": "Cologne Chip GateMate EVB",
    "vendor": "Cologne Chip",
    "family": "GateMate",
    "device": "CCGM1A1",
    "packageName": "unknown",
    "fpgaId": "ccgm1a1",
    "constraintsFile": "ccf",
    "synthesisFlow": "gatemate",
    "toolchain": "gatemate",
    "program": "openFPGALoader",
    "source": "colognechip_gatemate_evb",
    "clock": {
      "name": "clk10",
      "pin": "unknown",
      "frequency": 10000000
    },
    "pins": []
  },
  {
    "id": "colorlight-5a-75b",
    "name": "Colorlight 5A 75B",
    "vendor": "Colorlight",
    "family": "ECP5",
    "device": "LFE5U-25F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-25f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "colorlight_5a_75b",
    "clock": {
      "name": "clk25",
      "pin": "P6",
      "frequency": 25000000
    },
    "pins": [],
    "notes": "Published LiteX profile for r7.0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/colorlight_5a_75b.py. Programming is not configured until its adapter or bootloader profile is selected. Other revisions use different resource maps; the 75B r6.1 also uses CABGA381."
  },
  {
    "id": "colorlight-5a-75e",
    "name": "Colorlight 5A 75E",
    "vendor": "Colorlight",
    "family": "ECP5",
    "device": "LFE5U-25F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-25f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "colorlight_5a_75e",
    "clock": {
      "name": "clk25",
      "pin": "P6",
      "frequency": 25000000
    },
    "pins": [],
    "notes": "Published LiteX profile for r7.1; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/colorlight_5a_75e.py. Programming is not configured until its adapter or bootloader profile is selected. Other revisions use different resource maps; the 75B r6.1 also uses CABGA381."
  },
  {
    "id": "decklink-intensity-pro-4k",
    "name": "Decklink Intensity Pro 4K",
    "vendor": "Blackmagic Design",
    "family": "Kintex-7",
    "device": "XC7K70T",
    "packageName": "FBG676",
    "fpgaId": "xc7k70t-fbg676-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "decklink_intensity_pro_4k",
    "clock": {
      "name": "debug",
      "pin": "C14",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "decklink-mini-4k",
    "name": "Decklink Mini 4K",
    "vendor": "Blackmagic Design",
    "family": "Artix-7",
    "device": "XC7A100T",
    "packageName": "FGG676",
    "fpgaId": "xc7a100t-fgg676-3",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "decklink_mini_4k",
    "clock": {
      "name": "clk24",
      "pin": "M21",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "decklink-quad-hdmi-recorder",
    "name": "Decklink Quad Hdmi Recorder",
    "vendor": "Blackmagic Design",
    "family": "UltraScale+",
    "device": "XCKU040",
    "packageName": "FFVA1156",
    "fpgaId": "xcku040-ffva1156-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "decklink_quad_hdmi_recorder",
    "clock": {
      "name": "clk200",
      "pin": "AJ29",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "digilent-arty-s7",
    "name": "Digilent Arty S7",
    "vendor": "Digilent",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_arty_s7",
    "clock": {
      "name": "clk12",
      "pin": "F14",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "digilent-arty-z7",
    "name": "Digilent Arty Z7",
    "vendor": "Digilent",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_arty_z7",
    "clock": {
      "name": "clk125",
      "pin": "unknown",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "digilent-atlys",
    "name": "Digilent Atlys",
    "vendor": "Digilent",
    "family": "Spartan-6",
    "device": "XC6SLX45",
    "packageName": "CSG324",
    "fpgaId": "xc6slx45-csg324-3",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_atlys",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "digilent-basys3",
    "name": "Digilent BASYS3",
    "vendor": "Digilent",
    "family": "Artix-7",
    "device": "XC7A35T",
    "packageName": "CPG236",
    "fpgaId": "xc7a35t-cpg236-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_basys3",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "digilent-cmod-a7",
    "name": "Digilent Cmod A7",
    "vendor": "Digilent",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_cmod_a7",
    "clock": {
      "name": "clk12",
      "pin": "unknown",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "digilent-genesys2",
    "name": "Digilent GENESYS2",
    "vendor": "Digilent",
    "family": "Kintex-7",
    "device": "XC7K325T",
    "packageName": "FFG900",
    "fpgaId": "xc7k325t-ffg900-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_genesys2",
    "clock": {
      "name": "clk200",
      "pin": "unknown",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "digilent-netfpga-sume",
    "name": "Digilent NetFPGA-SUME",
    "vendor": "Digilent",
    "family": "Virtex-7",
    "device": "XC7VX690TFFG1761",
    "packageName": "3",
    "fpgaId": "xc7vx690tffg1761-3",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_netfpga_sume",
    "clock": {
      "name": "clk233",
      "pin": "E34",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "digilent-nexys-video",
    "name": "Digilent Nexys Video",
    "vendor": "Digilent",
    "family": "Artix-7",
    "device": "XC7A200T",
    "packageName": "SBG484",
    "fpgaId": "xc7a200t-sbg484-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_nexys_video",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "digilent-nexys4",
    "name": "Digilent NEXYS4",
    "vendor": "Digilent",
    "family": "Artix-7",
    "device": "XC7A100TCSG324",
    "packageName": "1",
    "fpgaId": "xc7a100tcsg324-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_nexys4",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "digilent-nexys4ddr",
    "name": "Digilent Nexys 4 DDR",
    "vendor": "Digilent",
    "family": "Artix-7",
    "device": "XC7A100TCSG324",
    "packageName": "1",
    "fpgaId": "xc7a100tcsg324-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_nexys4ddr",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "digilent-pynq-z1",
    "name": "Digilent PYNQ-Z1",
    "vendor": "Digilent",
    "family": "Zynq-7000",
    "device": "XC7Z020",
    "packageName": "CLG400",
    "fpgaId": "xc7z020-clg400-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_pynq_z1",
    "clock": {
      "name": "sysclk",
      "pin": "unknown",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "digilent-zedboard",
    "name": "Digilent Zedboard",
    "vendor": "Digilent",
    "family": "Zynq-7000",
    "device": "XC7Z020CLG484",
    "packageName": "1",
    "fpgaId": "xc7z020clg484-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_zedboard",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "digilent-zybo-z7",
    "name": "Digilent Zybo Z7",
    "vendor": "Digilent",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "digilent_zybo_z7",
    "clock": {
      "name": "clk125",
      "pin": "unknown",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "ebaz4205",
    "name": "EBAZ4205",
    "vendor": "Ebaz4205",
    "family": "Zynq-7000",
    "device": "XC7Z010",
    "packageName": "CLG400",
    "fpgaId": "xc7z010-clg400-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "ebaz4205",
    "clock": {
      "name": "clk33_333",
      "pin": "unknown",
      "frequency": 33333000
    },
    "pins": []
  },
  {
    "id": "efinix-t8f81-dev-kit",
    "name": "Efinix T8F81 Dev Kit",
    "vendor": "Efinix",
    "family": "Efinix",
    "device": "T8F81C2",
    "packageName": "T8",
    "fpgaId": "t8f81c2",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "efinix_t8f81_dev_kit",
    "clock": {
      "name": "clk33",
      "pin": "unknown",
      "frequency": 33333000
    },
    "pins": []
  },
  {
    "id": "efinix-ti375-c529-dev-kit",
    "name": "Efinix TI375 C529 Dev Kit",
    "vendor": "Efinix",
    "family": "Efinix",
    "device": "TI375C529C4",
    "packageName": "TI375",
    "fpgaId": "ti375c529c4",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "efinix_ti375_c529_dev_kit",
    "clock": {
      "name": "clk100",
      "pin": "U4",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "efinix-titanium-ti60-f225-dev-kit",
    "name": "Efinix Titanium TI60 F225 Dev Kit",
    "vendor": "Efinix",
    "family": "Efinix",
    "device": "TI60F225C3",
    "packageName": "TI60",
    "fpgaId": "ti60f225c3",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "efinix_titanium_ti60_f225_dev_kit",
    "clock": {
      "name": "clk33",
      "pin": "P2",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "efinix-trion-t20-bga256-dev-kit",
    "name": "Efinix Trion T20 BGA256 Dev Kit",
    "vendor": "Efinix",
    "family": "Efinix",
    "device": "T20F256C4",
    "packageName": "T20",
    "fpgaId": "t20f256c4",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "efinix_trion_t20_bga256_dev_kit",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "efinix-trion-t20-mipi-dev-kit",
    "name": "Efinix Trion T20 Mipi Dev Kit",
    "vendor": "Efinix",
    "family": "Efinix",
    "device": "T20F169C4",
    "packageName": "T20",
    "fpgaId": "t20f169c4",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "efinix_trion_t20_mipi_dev_kit",
    "clock": {
      "name": "clk50",
      "pin": "D13",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "efinix-trion-t120-bga576-dev-kit",
    "name": "Efinix Trion T120 BGA576 Dev Kit",
    "vendor": "Efinix",
    "family": "Efinix",
    "device": "T120F576I4",
    "packageName": "T120",
    "fpgaId": "t120f576i4",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "efinix_trion_t120_bga576_dev_kit",
    "clock": {
      "name": "clk50",
      "pin": "AA8",
      "frequency": 40000000
    },
    "pins": []
  },
  {
    "id": "efinix-tz170-j484-dev-kit",
    "name": "Efinix TZ170 J484 Dev Kit",
    "vendor": "Efinix",
    "family": "Efinix",
    "device": "TZ170J484I3",
    "packageName": "TZ170",
    "fpgaId": "tz170j484i3",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "efinix_tz170_j484_dev_kit",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "efinix-xyloni-dev-kit",
    "name": "Efinix Xyloni Dev Kit",
    "vendor": "Efinix",
    "family": "Efinix",
    "device": "T8F81C2",
    "packageName": "T8",
    "fpgaId": "t8f81c2",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "efinix_xyloni_dev_kit",
    "clock": {
      "name": "clk33",
      "pin": "unknown",
      "frequency": 33333000
    },
    "pins": []
  },
  {
    "id": "ego1",
    "name": "EGO1",
    "vendor": "Ego1",
    "family": "Artix-7",
    "device": "XC7A35TICSG324",
    "packageName": "1L",
    "fpgaId": "xc7a35ticsg324-1l",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "ego1",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "embedfire-rise-pro",
    "name": "Embedfire Rise Pro",
    "vendor": "Embedfire",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "embedfire_rise_pro",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "enclustra-mercury-kx2",
    "name": "Enclustra Mercury KX2",
    "vendor": "Enclustra",
    "family": "Kintex-7",
    "device": "XC7K160TFFG676",
    "packageName": "2",
    "fpgaId": "xc7k160tffg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "enclustra_mercury_kx2",
    "clock": {
      "name": "clk200",
      "pin": "unknown",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "enclustra-mercury-xu5",
    "name": "Enclustra Mercury XU5",
    "vendor": "Enclustra",
    "family": "Zynq UltraScale+",
    "device": "XCZU2EG",
    "packageName": "SFVC784",
    "fpgaId": "xczu2eg-sfvc784-1-i",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "enclustra_mercury_xu5",
    "clock": {
      "name": "clk100_gtr",
      "pin": "C21",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "enclustra-mercury-xu8-pe3",
    "name": "Enclustra Mercury XU8 PE3",
    "vendor": "Enclustra",
    "family": "Zynq UltraScale+",
    "device": "XCZU7EV",
    "packageName": "FBVB900",
    "fpgaId": "xczu7ev-fbvb900-2-i",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "enclustra_mercury_xu8_pe3",
    "clock": {
      "name": "clk100",
      "pin": "AJ6",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "enclustra-st1",
    "name": "Enclustra ST1",
    "vendor": "Enclustra",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "enclustra_st1",
    "clock": {
      "name": "clk",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "fairwaves-xtrx",
    "name": "Fairwaves Xtrx",
    "vendor": "Fairwaves",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "fairwaves_xtrx",
    "clock": {
      "name": "clk60",
      "pin": "unknown",
      "frequency": 60000000
    },
    "pins": []
  },
  {
    "id": "fpc-iii",
    "name": "Fpc Iii",
    "vendor": "Fpc",
    "family": "ECP5",
    "device": "LFE5U-85F",
    "packageName": "CABGA381",
    "fpgaId": "lfe5u-85f-cabga381",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "openFPGALoader",
    "source": "fpc_iii",
    "clock": {
      "name": "clk25",
      "pin": "P3",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "fpgawars-alhambra2",
    "name": "Fpgawars ALHAMBRA2",
    "vendor": "FPGAwars",
    "family": "iCE40 HX",
    "device": "iCE40HX8KTQ144:4K",
    "packageName": "TQ144:4K",
    "fpgaId": "ice40-hx8k-tq144:4k",
    "constraintsFile": "pcf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "iceprog",
    "source": "fpgawars_alhambra2",
    "clock": {
      "name": "clk12",
      "pin": "49",
      "frequency": 12000000
    },
    "pins": [],
    "notes": "Maker and LiteX record a 12 MHz oscillator on pad 49. Published open-source builds use --hx8k --package tq144:4k; no physical programming test was performed."
  },
  {
    "id": "gadgetfactory-papilio-pro",
    "name": "GadgetFactory Papilio Pro",
    "vendor": "GadgetFactory",
    "family": "Spartan-6",
    "device": "XC6SLX9",
    "packageName": "TQG144",
    "fpgaId": "xc6slx9-tqg144-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "gadgetfactory_papilio_pro",
    "clock": {
      "name": "clk32",
      "pin": "unknown",
      "frequency": 32000000
    },
    "pins": []
  },
  {
    "id": "hackaday-hadbadge",
    "name": "Hackaday Hadbadge",
    "vendor": "Hackaday",
    "family": "ECP5",
    "device": "LFE5U-45F",
    "packageName": "CABGA381",
    "fpgaId": "lfe5u-45f-cabga381",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "openFPGALoader",
    "source": "hackaday_hadbadge",
    "clock": {
      "name": "clk8",
      "pin": "U18",
      "frequency": 8000000
    },
    "pins": []
  },
  {
    "id": "hseda-xc7a35t",
    "name": "Hseda Xc7a35t",
    "vendor": "Hseda",
    "family": "Artix-7",
    "device": "XC7A35TFTG256",
    "packageName": "1",
    "fpgaId": "xc7a35tftg256-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "hseda_xc7a35t",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "hyvision-pcie-opt01-revf",
    "name": "Hyvision Pcie OPT01 Revf",
    "vendor": "Hyvision",
    "family": "Kintex-7",
    "device": "XC7K70T",
    "packageName": "FBG676",
    "fpgaId": "xc7k70t-fbg676-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "hyvision_pcie_opt01_revf",
    "clock": {
      "name": "clk200",
      "pin": "AA10",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "intergalaktik-ulx5m-gs",
    "name": "Intergalaktik ULX5M GS",
    "vendor": "Intergalaktik",
    "family": "GateMate",
    "device": "CCGM1A1",
    "packageName": "unknown",
    "fpgaId": "ccgm1a1",
    "constraintsFile": "ccf",
    "synthesisFlow": "gatemate",
    "toolchain": "gatemate",
    "program": "openFPGALoader",
    "source": "intergalaktik_ulx5m_gs",
    "clock": {
      "name": "clk25",
      "pin": "unknown",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "isx-im1283",
    "name": "Isx IM1283",
    "vendor": "Isx",
    "family": "Artix-7",
    "device": "XC7A100TFGG676",
    "packageName": "2",
    "fpgaId": "xc7a100tfgg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "isx_im1283",
    "clock": {
      "name": "clk200",
      "pin": "unknown",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "jungle-electronics-fireant",
    "name": "Jungle Electronics FireAnt",
    "vendor": "Jungle Electronics",
    "family": "Efinix",
    "device": "T8F81C2",
    "packageName": "T8",
    "fpgaId": "t8f81c2",
    "constraintsFile": "peri",
    "synthesisFlow": "efinity",
    "toolchain": "efinity",
    "program": "efinity",
    "source": "jungle_electronics_fireant",
    "clock": {
      "name": "clk33",
      "pin": "unknown",
      "frequency": 33330000
    },
    "pins": []
  },
  {
    "id": "kosagi-fomu-evt",
    "name": "Kosagi Fomu Evt",
    "vendor": "Kosagi",
    "family": "iCE40 UltraPlus",
    "device": "iCE40UP5KSG48",
    "packageName": "SG48",
    "fpgaId": "ice40-up5k-sg48",
    "constraintsFile": "pcf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "iceprog",
    "source": "kosagi_fomu_evt",
    "clock": {
      "name": "clk48",
      "pin": "44",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published identity and clock data from LiteX-Boards c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a; hardware validation is still required."
  },
  {
    "id": "kosagi-fomu-hacker",
    "name": "Kosagi Fomu Hacker",
    "vendor": "Kosagi",
    "family": "iCE40 UltraPlus",
    "device": "iCE40UP5KUWG30",
    "packageName": "UWG30",
    "fpgaId": "ice40-up5k-uwg30",
    "constraintsFile": "pcf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "iceprog",
    "source": "kosagi_fomu_hacker",
    "clock": {
      "name": "clk48",
      "pin": "F5",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published identity and clock data from LiteX-Boards c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a; hardware validation is still required."
  },
  {
    "id": "krtkl-snickerdoodle",
    "name": "Krtkl Snickerdoodle",
    "vendor": "Krtkl",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "krtkl_snickerdoodle",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "lambdaconcept-pcie-screamer-m2",
    "name": "LambdaConcept PCIe Screamer M.2",
    "vendor": "LambdaConcept",
    "family": "Artix-7",
    "device": "XC7A35T",
    "packageName": "CSG325",
    "fpgaId": "xc7a35t-csg325-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "lambdaconcept_pcie_screamer_m2",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "lambdaconcept-pcie-screamer",
    "name": "LambdaConcept PCIe Screamer",
    "vendor": "LambdaConcept",
    "family": "Artix-7",
    "device": "XC7A35T",
    "packageName": "FGG484",
    "fpgaId": "xc7a35t-fgg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "lambdaconcept_pcie_screamer",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "lattice-certuspro-nx-evn",
    "name": "Lattice Certuspro Nx Evn",
    "vendor": "Lattice",
    "family": "Lattice Nexus",
    "device": "LFCPNX",
    "packageName": "unknown",
    "fpgaId": "lfcpnx",
    "constraintsFile": "pdc",
    "synthesisFlow": "radiant",
    "toolchain": "radiant",
    "program": "radiant",
    "source": "lattice_certuspro_nx_evn",
    "clock": {
      "name": "clk125_clk_dis",
      "pin": "J23",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "lattice-certuspro-nx-versa",
    "name": "Lattice Certuspro Nx Versa",
    "vendor": "Lattice",
    "family": "Lattice Nexus",
    "device": "LFCPNX",
    "packageName": "unknown",
    "fpgaId": "lfcpnx",
    "constraintsFile": "pdc",
    "synthesisFlow": "radiant",
    "toolchain": "radiant",
    "program": "radiant",
    "source": "lattice_certuspro_nx_versa",
    "clock": {
      "name": "clkin125",
      "pin": "P24",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "lattice-certuspro-nx-vvml",
    "name": "Lattice Certuspro Nx Vvml",
    "vendor": "Lattice",
    "family": "Lattice Nexus",
    "device": "LFCPNX",
    "packageName": "unknown",
    "fpgaId": "lfcpnx",
    "constraintsFile": "pdc",
    "synthesisFlow": "radiant",
    "toolchain": "radiant",
    "program": "radiant",
    "source": "lattice_certuspro_nx_vvml",
    "clock": {
      "name": "clk27",
      "pin": "M22",
      "frequency": 24000000
    },
    "pins": []
  },
  {
    "id": "lattice-crosslink-nx-evn",
    "name": "Lattice Crosslink Nx Evn",
    "vendor": "Lattice",
    "family": "Lattice Nexus",
    "device": "LIFCL-40-9BG400C",
    "packageName": "unknown",
    "fpgaId": "lifcl-40-9bg400c",
    "constraintsFile": "pdc",
    "synthesisFlow": "radiant",
    "toolchain": "radiant",
    "program": "radiant",
    "source": "lattice_crosslink_nx_evn",
    "clock": {
      "name": "clk12",
      "pin": "unknown",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "lattice-crosslink-nx-vip",
    "name": "Lattice Crosslink Nx Vip",
    "vendor": "Lattice",
    "family": "Lattice Nexus",
    "device": "LIFCL",
    "packageName": "unknown",
    "fpgaId": "lifcl",
    "constraintsFile": "pdc",
    "synthesisFlow": "radiant",
    "toolchain": "radiant",
    "program": "radiant",
    "source": "lattice_crosslink_nx_vip",
    "clock": {
      "name": "clk12",
      "pin": "L16",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "lattice-ecp5-vip",
    "name": "Lattice ECP5 Vip",
    "vendor": "Lattice",
    "family": "ECP5",
    "device": "LFE5UM-85F",
    "packageName": "CABGA756",
    "fpgaId": "lfe5um-85f-cabga756",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "openFPGALoader",
    "source": "lattice_ecp5_vip",
    "clock": {
      "name": "clk100",
      "pin": "C5",
      "frequency": 27000000
    },
    "pins": []
  },
  {
    "id": "lattice-machxo3",
    "name": "Lattice MACHXO3",
    "vendor": "Lattice",
    "family": "FPGA",
    "device": "LCMXO3L-6900C-5BG256C",
    "packageName": "unknown",
    "fpgaId": "lcmxo3l-6900c-5bg256c",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "lattice_machxo3",
    "clock": {
      "name": "clk12",
      "pin": "unknown",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "lckfb-ljpi",
    "name": "LCKFB LJPi",
    "vendor": "Lckfb",
    "family": "Gowin",
    "device": "GW2A-LV18PG256C8/I7",
    "packageName": "unknown",
    "fpgaId": "gw2a-lv18pg256c8/i7",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "lckfb_ljpi",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "limesdr-mini-v2",
    "name": "LimeSDR Mini V2 v2.3 default assembly",
    "vendor": "Lime Microsystems",
    "family": "ECP5",
    "device": "LFE5U-45F-MG285",
    "packageName": "CSFBGA285",
    "fpgaId": "lfe5u-45f-csfbga285",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "limesdr_mini_v2",
    "clock": {
      "name": "clk40",
      "pin": "A9",
      "frequency": 40000000
    },
    "pins": [],
    "notes": "Manufacturer v2.3 documentation specifies LFE5U-45F-MG285 by default, a 40 MHz VCTCXO on A9, and an unpopulated J5 JTAG header. Other densities are possible. An external probe and a tested programming command are unresolved; no direct programming profile is configured."
  },
  {
    "id": "limesdr-xtrx",
    "name": "Limesdr Xtrx",
    "vendor": "Lime Microsystems",
    "family": "Artix-7",
    "device": "XC7A50TCPG236",
    "packageName": "2",
    "fpgaId": "xc7a50tcpg236-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "limesdr_xtrx",
    "clock": {
      "name": "clk26",
      "pin": "unknown",
      "frequency": 26000000
    },
    "pins": []
  },
  {
    "id": "linsn-rv901t",
    "name": "Linsn RV901T",
    "vendor": "Linsn",
    "family": "Spartan-6",
    "device": "XC6SLX16",
    "packageName": "2",
    "fpgaId": "xc6slx16-2-ftg256",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "linsn_rv901t",
    "clock": {
      "name": "eth_clocks",
      "pin": "J1",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "litex-acorn-baseboard",
    "name": "LiteX Acorn Baseboard",
    "vendor": "Litex",
    "family": "ECP5",
    "device": "LFE5UM5G-45F",
    "packageName": "CABGA381",
    "fpgaId": "lfe5um5g-45f-cabga381",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "openFPGALoader",
    "source": "litex_acorn_baseboard",
    "clock": {
      "name": "clk50",
      "pin": "L19",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "logicbone",
    "name": "Logicbone",
    "vendor": "Logicbone",
    "family": "ECP5",
    "device": "LFE5UM5G-45F",
    "packageName": "CABGA381",
    "fpgaId": "lfe5um5g-45f-cabga381",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "logicbone",
    "clock": {
      "name": "clk25",
      "pin": "M19",
      "frequency": 25000000,
      "ioStandard": "LVCMOS18"
    },
    "pins": [],
    "notes": "Published LiteX profile for rev0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/logicbone.py. Programming is not configured until its adapter or bootloader profile is selected. Clock is LVCMOS18. Published DFU bootloader selector is 1d50:6130."
  },
  {
    "id": "machdyne-kolsch",
    "name": "Machdyne Kolsch",
    "vendor": "Machdyne",
    "family": "GateMate",
    "device": "CCGM1A1",
    "packageName": "unknown",
    "fpgaId": "ccgm1a1",
    "constraintsFile": "ccf",
    "synthesisFlow": "gatemate",
    "toolchain": "gatemate",
    "program": "openFPGALoader",
    "source": "machdyne_kolsch",
    "clock": {
      "name": "clk48",
      "pin": "unknown",
      "frequency": 48000000
    },
    "pins": []
  },
  {
    "id": "machdyne-konfekt",
    "name": "Machdyne Konfekt",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-12F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-12f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_konfekt",
    "clock": {
      "name": "clk48",
      "pin": "A7",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_konfekt.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-kopflos",
    "name": "Machdyne Kopflos",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-12F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-12f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_kopflos",
    "clock": {
      "name": "clk48",
      "pin": "A7",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_kopflos.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-krote",
    "name": "Machdyne Kröte",
    "vendor": "Machdyne",
    "family": "iCE40 HX",
    "device": "iCE40HX4KBG121",
    "packageName": "BG121",
    "fpgaId": "ice40-hx4k-bg121",
    "constraintsFile": "pcf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "ldprog",
    "source": "machdyne_krote",
    "clock": {
      "name": "clk100",
      "pin": "B6",
      "frequency": 100000000
    },
    "pins": [],
    "notes": "Maker krote.pcf and Makefile specify HX4K BG121, clock B6, four LEDs and five Pmods. The maker uses ldprog for SRAM or flash via an external ISP adapter; adapter selection and physical programming remain untested in Allora."
  },
  {
    "id": "machdyne-lakritz",
    "name": "Machdyne Lakritz",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-25F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-25f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_lakritz",
    "clock": {
      "name": "clk48",
      "pin": "A7",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_lakritz.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-minze",
    "name": "Machdyne Minze",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-12F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-12f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_minze",
    "clock": {
      "name": "clk48",
      "pin": "A7",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_minze.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-mozart-ml1",
    "name": "Machdyne Mozart ML1",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-45F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-45f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_mozart_ml1",
    "clock": {
      "name": "clk48",
      "pin": "A7",
      "frequency": 48000000
    },
    "additionalClocks": [
      {
        "name": "clk50",
        "pin": "C7",
        "frequency": 50000000
      }
    ],
    "pins": [],
    "notes": "Published LiteX profile for v2; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_mozart_ml1.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-mozart-ml2",
    "name": "Machdyne Mozart ML2",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-45F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-45f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_mozart_ml2",
    "clock": {
      "name": "clk48",
      "pin": "C7",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_mozart_ml2.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-mozart-mx1",
    "name": "Machdyne Mozart MX1",
    "vendor": "Machdyne",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "machdyne_mozart_mx1",
    "clock": {
      "name": "clk48",
      "pin": "unknown",
      "frequency": 48000000
    },
    "pins": []
  },
  {
    "id": "machdyne-mozart-mx2",
    "name": "Machdyne Mozart MX2",
    "vendor": "Machdyne",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "machdyne_mozart_mx2",
    "clock": {
      "name": "clk48",
      "pin": "unknown",
      "frequency": 48000000
    },
    "pins": []
  },
  {
    "id": "machdyne-noir",
    "name": "Machdyne Noir",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-45F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-45f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_noir",
    "clock": {
      "name": "clk48",
      "pin": "A7",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_noir.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-schoko",
    "name": "Machdyne Schoko",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-45F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-45f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_schoko",
    "clock": {
      "name": "clk48",
      "pin": "A7",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v1; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_schoko.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-vanille",
    "name": "Machdyne Vanille",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-12F",
    "packageName": "TQFP144",
    "fpgaId": "lfe5u-12f-tqfp144",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_vanille",
    "clock": {
      "name": "clk48",
      "pin": "128",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v0; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_vanille.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "machdyne-vivaldi-ml1",
    "name": "Machdyne Vivaldi ML1",
    "vendor": "Machdyne",
    "family": "ECP5",
    "device": "LFE5U-45F",
    "packageName": "CABGA256",
    "fpgaId": "lfe5u-45f-cabga256",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "machdyne_vivaldi_ml1",
    "clock": {
      "name": "clk48",
      "pin": "A7",
      "frequency": 48000000
    },
    "pins": [],
    "notes": "Published LiteX profile for v2; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_vivaldi_ml1.py. Programming is not configured until its adapter or bootloader profile is selected. Requires an external openFPGALoader cable selected for the connected adapter."
  },
  {
    "id": "micronova-mercury2",
    "name": "MicroNova Mercury 2",
    "vendor": "Micronova",
    "family": "Artix-7",
    "device": "XC7A35TFTG256",
    "packageName": "1",
    "fpgaId": "xc7a35tftg256-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "micronova_mercury2",
    "clock": {
      "name": "clk_en",
      "pin": "H16",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "microphase-a7-lite",
    "name": "Microphase A7 Lite",
    "vendor": "Microphase",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "microphase_a7_lite",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "microsoft-catapult-v3",
    "name": "Microsoft Catapult V3",
    "vendor": "Microsoft",
    "family": "Cyclone",
    "device": "10AXF40GAE",
    "packageName": "unknown",
    "fpgaId": "10axf40gae",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "microsoft_catapult_v3",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "mist",
    "name": "Mist",
    "vendor": "Mist",
    "family": "Cyclone",
    "device": "EP3C25E144C8",
    "packageName": "unknown",
    "fpgaId": "ep3c25e144c8",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "mist",
    "clock": {
      "name": "clk27",
      "pin": "55",
      "frequency": 27000000
    },
    "pins": []
  },
  {
    "id": "mlkpai-fs01-dr1v90m",
    "name": "Milk-V? FS01 DR1V90M",
    "vendor": "Mlkpai",
    "family": "FPGA",
    "device": "DR1V90MEG484",
    "packageName": "unknown",
    "fpgaId": "dr1v90meg484",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "mlkpai_fs01_dr1v90m",
    "clock": {
      "name": "clk25",
      "pin": "unknown",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "mnt-rkx7",
    "name": "MNT RKX7",
    "vendor": "Mnt",
    "family": "Kintex-7",
    "device": "XC7K325T",
    "packageName": "FFG676",
    "fpgaId": "xc7k325t-ffg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "mnt_rkx7",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "modretro-chromatic",
    "name": "Modretro Chromatic",
    "vendor": "Modretro",
    "family": "Gowin",
    "device": "GW5A-LV25PG256C1/I0",
    "packageName": "unknown",
    "fpgaId": "gw5a-lv25pg256c1/i0",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "modretro_chromatic",
    "clock": {
      "name": "clk_fpga",
      "pin": "unknown",
      "frequency": 33554319
    },
    "pins": []
  },
  {
    "id": "myir-myc-j7a100t",
    "name": "Myir Myc J7A100T",
    "vendor": "Myir",
    "family": "Artix-7",
    "device": "XC7A100TFGG484",
    "packageName": "2",
    "fpgaId": "xc7a100tfgg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "myir_myc_j7a100t",
    "clock": {
      "name": "eth_clocks",
      "pin": "Y18",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "myminieye-runber",
    "name": "Myminieye Runber",
    "vendor": "Myminieye",
    "family": "Gowin",
    "device": "GW1N-UV4LQ144C6/I5",
    "packageName": "unknown",
    "fpgaId": "gw1n-uv4lq144c6/i5",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "myminieye_runber",
    "clock": {
      "name": "clk12",
      "pin": "unknown",
      "frequency": 12000000
    },
    "pins": []
  },
  {
    "id": "newae-cw305",
    "name": "Newae CW305",
    "vendor": "Newae",
    "family": "Artix-7",
    "device": "XC7A100T",
    "packageName": "FTG256",
    "fpgaId": "xc7a100t-ftg256-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "newae_cw305",
    "clock": {
      "name": "clk",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "numato-aller",
    "name": "Numato Aller",
    "vendor": "Numato",
    "family": "Artix-7",
    "device": "XC7A200T",
    "packageName": "FBG484",
    "fpgaId": "xc7a200t-fbg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "numato_aller",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "numato-mimas-a7",
    "name": "Numato Mimas A7",
    "vendor": "Numato",
    "family": "Artix-7",
    "device": "XC7A50TFGG484",
    "packageName": "1",
    "fpgaId": "xc7a50tfgg484-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "numato_mimas_a7",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "numato-nereid",
    "name": "Numato Nereid",
    "vendor": "Numato",
    "family": "Kintex-7",
    "device": "XC7K160T",
    "packageName": "FBG676",
    "fpgaId": "xc7k160t-fbg676-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "numato_nereid",
    "clock": {
      "name": "clk150",
      "pin": "G24",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "numato-tagus",
    "name": "Numato Tagus",
    "vendor": "Numato",
    "family": "Artix-7",
    "device": "XC7A200T",
    "packageName": "FBG484",
    "fpgaId": "xc7a200t-fbg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "numato_tagus",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "ocp-tap-timecard",
    "name": "OCP TAP Timecard",
    "vendor": "Ocp",
    "family": "Artix-7",
    "device": "XC7A100T",
    "packageName": "FGG484",
    "fpgaId": "xc7a100t-fgg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "ocp_tap_timecard",
    "clock": {
      "name": "clk200",
      "pin": "R4",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "olimex-gatemate-a1-evb",
    "name": "Olimex GateMate A1 EVB",
    "vendor": "Olimex",
    "family": "GateMate",
    "device": "CCGM1A1",
    "packageName": "unknown",
    "fpgaId": "ccgm1a1",
    "constraintsFile": "ccf",
    "synthesisFlow": "gatemate",
    "toolchain": "gatemate",
    "program": "openFPGALoader",
    "source": "olimex_gatemate_a1_evb",
    "clock": {
      "name": "clk0",
      "pin": "unknown",
      "frequency": 10000000
    },
    "pins": []
  },
  {
    "id": "opalkelly-xem8320",
    "name": "Opal Kelly XEM8320",
    "vendor": "Opal Kelly",
    "family": "FPGA",
    "device": "XCAU25P-FFVB676-2-E",
    "packageName": "unknown",
    "fpgaId": "xcau25p-ffvb676-2-e",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "opalkelly_xem8320",
    "clock": {
      "name": "sys_clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "opensourcesdrlab-kintex7",
    "name": "Opensourcesdrlab KINTEX7",
    "vendor": "Opensourcesdrlab",
    "family": "Kintex-7",
    "device": "XC7K325TFFG676",
    "packageName": "2",
    "fpgaId": "xc7k325tffg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "opensourcesdrlab_kintex7",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "pano-logic-g2",
    "name": "Pano Logic G2",
    "vendor": "Pano",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "pano_logic_g2",
    "clock": {
      "name": "ddram_clock_b",
      "pin": "H4",
      "frequency": 125000000
    },
    "pins": []
  },
  {
    "id": "puzhi-p7-starlite",
    "name": "Puzhi P7 Starlite",
    "vendor": "Puzhi",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "puzhi_p7_starlite",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "puzhi-pz-a7xxt-kfb",
    "name": "Puzhi PZ A7xxT KFB",
    "vendor": "Puzhi",
    "family": "Artix-7",
    "device": "XC7A200TFBG484",
    "packageName": "2",
    "fpgaId": "xc7a200tfbg484-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "puzhi_pz_a7xxt_kfb",
    "clock": {
      "name": "clk200",
      "pin": "unknown",
      "frequency": 200000000
    },
    "pins": []
  },
  {
    "id": "qmtech-5cefa2",
    "name": "QMTech 5CEFA2",
    "vendor": "QMTech",
    "family": "Cyclone",
    "device": "5CEFA2F23C8",
    "packageName": "unknown",
    "fpgaId": "5cefa2f23c8",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "qmtech_5cefa2",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-5cefa5",
    "name": "QMTech 5CEFA5",
    "vendor": "QMTech",
    "family": "Cyclone",
    "device": "5CEFA5F23I7",
    "packageName": "unknown",
    "fpgaId": "5cefa5f23i7",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "qmtech_5cefa5",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-10cl006",
    "name": "QMTech 10CL006",
    "vendor": "QMTech",
    "family": "Cyclone",
    "device": "10CL006YU256C8G",
    "packageName": "YU256",
    "fpgaId": "10cl006yu256c8g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "qmtech_10cl006",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-artix7-fbg484",
    "name": "QMTech Artix-7 FBG484",
    "vendor": "QMTech",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "qmtech_artix7_fbg484",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-artix7-fgg676",
    "name": "QMTech Artix-7 FGG676",
    "vendor": "QMTech",
    "family": "Artix-7",
    "device": "XC7A200TFBG676",
    "packageName": "2",
    "fpgaId": "xc7a200tfbg676-2",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "qmtech_artix7_fgg676",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-cyclone10-starterkit",
    "name": "QMTech Cyclone 10 Starter Kit",
    "vendor": "QMTech",
    "family": "Cyclone",
    "device": "10CL080YU484C8G",
    "packageName": "YU484",
    "fpgaId": "10cl080yu484c8g",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "qmtech_cyclone10_starterkit",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-daughterboard",
    "name": "Qmtech Daughterboard",
    "vendor": "QMTech",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "qmtech_daughterboard",
    "clock": {
      "name": "clk",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "qmtech-ep4ce15-starter-kit",
    "name": "QMTech EP4CE15 Starter Kit",
    "vendor": "QMTech",
    "family": "Cyclone",
    "device": "EP4CE15F23C8",
    "packageName": "F23",
    "fpgaId": "ep4ce15f23c8",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "qmtech_ep4ce15_starter_kit",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-ep4cex5",
    "name": "QMTech EP4CEx5",
    "vendor": "QMTech",
    "family": "Cyclone",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "qmtech_ep4cex5",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-ep4cgx150",
    "name": "QMTech EP4CGX150",
    "vendor": "QMTech",
    "family": "Cyclone",
    "device": "EP4CGX150DF27I7",
    "packageName": "F27",
    "fpgaId": "ep4cgx150df27i7",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "qmtech_ep4cgx150",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-kintex7-devboard",
    "name": "QMTech Kintex-7 Devboard",
    "vendor": "QMTech",
    "family": "Kintex-7",
    "device": "XC7K325TFFG676",
    "packageName": "1",
    "fpgaId": "xc7k325tffg676-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "qmtech_kintex7_devboard",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-rp2040-daughterboard",
    "name": "Qmtech RP2040 Daughterboard",
    "vendor": "QMTech",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "qmtech_rp2040_daughterboard",
    "clock": {
      "name": "clk",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "qmtech-wukong",
    "name": "Qmtech Wukong",
    "vendor": "QMTech",
    "family": "FPGA",
    "device": "UNKNOWN",
    "packageName": "unknown",
    "fpgaId": "unknown",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "qmtech_wukong",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-xc7a35t",
    "name": "QMTech XC7A35T",
    "vendor": "QMTech",
    "family": "Artix-7",
    "device": "XC7A35TFTG256",
    "packageName": "1",
    "fpgaId": "xc7a35tftg256-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "qmtech_xc7a35t",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "qmtech-xc7k325t",
    "name": "QMTech XC7K325T",
    "vendor": "QMTech",
    "family": "Kintex-7",
    "device": "XC7K325TFFG676",
    "packageName": "1",
    "fpgaId": "xc7k325tffg676-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "qmtech_xc7k325t",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "quicklogic-quickfeather",
    "name": "QuickLogic QuickFeather",
    "vendor": "QuickLogic",
    "family": "QuickLogic",
    "device": "QL-EOS-S3",
    "packageName": "unknown",
    "fpgaId": "ql-eos-s3",
    "constraintsFile": "pcf",
    "synthesisFlow": "quicklogic",
    "toolchain": "quicklogic",
    "program": "quicklogic",
    "source": "quicklogic_quickfeather",
    "clock": {
      "name": "clk",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "qwertyembedded-beaglewire",
    "name": "QWERTY Embedded BeagleWire",
    "vendor": "Qwertyembedded",
    "family": "iCE40 HX",
    "device": "iCE40HX8KTQ144:4K",
    "packageName": "TQ144:4K",
    "fpgaId": "ice40-hx8k-tq144:4k",
    "constraintsFile": "pcf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "qwertyembedded_beaglewire",
    "clock": {
      "name": "clk100",
      "pin": "61",
      "frequency": 100000000
    },
    "pins": [],
    "notes": "Published identity and clock data from LiteX-Boards c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a; hardware validation is still required. Programming requires a BeagleBone-host SPI/flashrom or kernel workflow; no direct local USB profile is configured."
  },
  {
    "id": "radiona-ulx4m-ld-v2",
    "name": "Radiona ULX4M Ld V2",
    "vendor": "Radiona",
    "family": "ECP5",
    "device": "LFE5UM5G-85F",
    "packageName": "CABGA381",
    "fpgaId": "lfe5um5g-85f-cabga381",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "radiona_ulx4m_ld_v2",
    "clock": {
      "name": "clk25",
      "pin": "G2",
      "frequency": 25000000
    },
    "pins": [],
    "notes": "Published LiteX profile for r0.3; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/radiona_ulx4m_ld_v2.py. Programming is not configured until its adapter or bootloader profile is selected. Published loader profile is ulx4m_dfu (1d50:614b, alternate 0); image format and bootloader remain untested."
  },
  {
    "id": "radiona-ulx4m-ls-v2",
    "name": "Radiona ULX4M Ls V2",
    "vendor": "Radiona",
    "family": "ECP5",
    "device": "LFE5U-85F",
    "packageName": "CABGA381",
    "fpgaId": "lfe5u-85f-cabga381",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "radiona_ulx4m_ls_v2",
    "clock": {
      "name": "clk25",
      "pin": "G2",
      "frequency": 25000000
    },
    "pins": [],
    "notes": "Published LiteX profile for r0.1; confirm the board revision and populated device before programming. Source: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/radiona_ulx4m_ls_v2.py. Programming is not configured until its adapter or bootloader profile is selected. Published loader profile is ulx4m_dfu (1d50:614b, alternate 0); image format and bootloader remain untested."
  },
  {
    "id": "rcs-arctic-tern-bmc-card",
    "name": "RCS Arctic Tern BMC Card",
    "vendor": "Rcs",
    "family": "ECP5",
    "device": "LFE5UM-85F",
    "packageName": "CABGA381",
    "fpgaId": "lfe5um-85f-cabga381",
    "constraintsFile": "lpf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "rcs_arctic_tern_bmc_card",
    "clock": {
      "name": "clk125",
      "pin": "B6",
      "frequency": 125000000
    },
    "pins": [],
    "notes": "The manufacturer schematic labels the FPGA symbols ECP5UM-85-CABGA381, while an overview line lists LFE5UM5G-85F-8BG381I; confirm the physical assembly marking before a build. The integration guide requires an external JTAG probe on the carrier header. No tested programming profile is configured.",
    "identityUnresolved": true
  },
  {
    "id": "redpitaya",
    "name": "Redpitaya",
    "vendor": "Redpitaya",
    "family": "Zynq-7000",
    "device": "XC7Z010CLG400",
    "packageName": "1",
    "fpgaId": "xc7z010clg400-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "redpitaya",
    "clock": {
      "name": "clk125",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "rz-easyfpga",
    "name": "RZ EasyFPGA",
    "vendor": "Rz",
    "family": "Cyclone",
    "device": "EP4CE6E22C8",
    "packageName": "unknown",
    "fpgaId": "ep4ce6e22c8",
    "constraintsFile": "qsf",
    "synthesisFlow": "quartus",
    "toolchain": "quartus",
    "program": "USB-Blaster",
    "source": "rz_easyfpga",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "saanlima-pipistrello",
    "name": "Saanlima Pipistrello",
    "vendor": "Saanlima",
    "family": "Spartan-6",
    "device": "XC6SLX45",
    "packageName": "CSG324",
    "fpgaId": "xc6slx45-csg324-3",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "saanlima_pipistrello",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "scarabhardware-minispartan6",
    "name": "Scarabhardware miniSpartan6",
    "vendor": "Scarabhardware",
    "family": "Spartan-6",
    "device": "XC6SLX25",
    "packageName": "unknown",
    "fpgaId": "xc6slx25",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "scarabhardware_minispartan6",
    "clock": {
      "name": "clk50",
      "pin": "K3",
      "frequency": 32000000
    },
    "pins": []
  },
  {
    "id": "seeedstudio-spartan-edge-accelerator",
    "name": "Seeed Spartan Edge Accelerator",
    "vendor": "Seeed Studio",
    "family": "Spartan-7",
    "device": "XC7S15",
    "packageName": "FTGB196",
    "fpgaId": "xc7s15-ftgb196",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "seeedstudio_spartan_edge_accelerator",
    "clock": {
      "name": "clk100",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "siglent-sds1104xe",
    "name": "Siglent SDS1104X-E",
    "vendor": "Siglent",
    "family": "Zynq-7000",
    "device": "XC7Z020",
    "packageName": "CLG484",
    "fpgaId": "xc7z020-clg484-1",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "siglent_sds1104xe",
    "clock": {
      "name": "clk25",
      "pin": "unknown",
      "frequency": 25000000
    },
    "pins": []
  },
  {
    "id": "signaloid-c0-microsd",
    "name": "Signaloid C0 microSD",
    "vendor": "Signaloid",
    "family": "iCE40 UltraPlus",
    "device": "iCE40UP5KUWG30",
    "packageName": "UWG30",
    "fpgaId": "ice40-up5k-uwg30",
    "constraintsFile": "pcf",
    "synthesisFlow": "yosys-nextpnr",
    "toolchain": "yosys",
    "program": "",
    "source": "signaloid_c0_microsd",
    "clock": {
      "name": "hfosc12",
      "frequency": 12000000,
      "source": "internal-hfosc"
    },
    "pins": [],
    "notes": "Published identity and clock data from LiteX-Boards c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a; hardware validation is still required. The design must instantiate SB_HFOSC; B3 is SD_CLK, not a dedicated oscillator pad. Custom BIN images are flashed through the SD host with the maker toolkit; no direct programmer is configured."
  },
  {
    "id": "sipeed-slogic16u3",
    "name": "Sipeed SLogic16U3",
    "vendor": "Sipeed",
    "family": "Gowin",
    "device": "GW5AT-LV15MG132C1/I0",
    "packageName": "unknown",
    "fpgaId": "gw5at-lv15mg132c1/i0",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "sipeed_slogic16u3",
    "clock": {
      "name": "clk",
      "pin": "unknown",
      "frequency": 100000000
    },
    "pins": []
  },
  {
    "id": "sipeed-tang-console",
    "name": "Sipeed Tang Console",
    "vendor": "Sipeed",
    "family": "Gowin",
    "device": "GW5AT-LV60PG484AC1/I0",
    "packageName": "unknown",
    "fpgaId": "gw5at-lv60pg484ac1/i0",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "sipeed_tang_console",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "sipeed-tang-mega-138k-pro",
    "name": "Sipeed Tang Mega 138K Pro",
    "vendor": "Sipeed",
    "family": "Gowin",
    "device": "GW5AST-LV138FPG676AES",
    "packageName": "unknown",
    "fpgaId": "gw5ast-lv138fpg676aes",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "sipeed_tang_mega_138k_pro",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "sipeed-tang-mega-138k",
    "name": "Sipeed Tang Mega 138K",
    "vendor": "Sipeed",
    "family": "Gowin",
    "device": "GW5AST-LV138PG484AC1/I0",
    "packageName": "unknown",
    "fpgaId": "gw5ast-lv138pg484ac1/i0",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "sipeed_tang_mega_138k",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "sipeed-tang-nano-4k",
    "name": "Sipeed Tang Nano 4K",
    "vendor": "Sipeed",
    "family": "Gowin",
    "device": "GW1NSR-LV4CQN48PC6/I5",
    "packageName": "QN48",
    "fpgaId": "gw1nsr-lv4cqn48pc6/i5",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "sipeed_tang_nano_4k",
    "clock": {
      "name": "clk27",
      "pin": "unknown",
      "frequency": 27000000
    },
    "pins": []
  },
  {
    "id": "sipeed-tang-nano",
    "name": "Sipeed Tang Nano",
    "vendor": "Sipeed",
    "family": "Gowin",
    "device": "GW1N-LV1QN48C6/I5",
    "packageName": "QN48",
    "fpgaId": "gw1n-lv1qn48c6/i5",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "sipeed_tang_nano",
    "clock": {
      "name": "clk24",
      "pin": "unknown",
      "frequency": 24000000
    },
    "pins": []
  },
  {
    "id": "sipeed-tang-primer-20k",
    "name": "Sipeed Tang Primer 20K",
    "vendor": "Sipeed",
    "family": "Gowin",
    "device": "GW2A-LV18PG256C8/I7",
    "packageName": "unknown",
    "fpgaId": "gw2a-lv18pg256c8/i7",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "sipeed_tang_primer_20k",
    "clock": {
      "name": "clk27",
      "pin": "unknown",
      "frequency": 27000000
    },
    "pins": []
  },
  {
    "id": "sipeed-tang-primer-25k",
    "name": "Sipeed Tang Primer 25K",
    "vendor": "Sipeed",
    "family": "Gowin",
    "device": "GW5A-LV25MG121NC1/I0",
    "packageName": "unknown",
    "fpgaId": "gw5a-lv25mg121nc1/i0",
    "constraintsFile": "cst",
    "synthesisFlow": "gowin",
    "toolchain": "gowin",
    "program": "openFPGALoader",
    "source": "sipeed_tang_primer_25k",
    "clock": {
      "name": "clk50",
      "pin": "unknown",
      "frequency": 50000000
    },
    "pins": []
  },
  {
    "id": "sipeed-tang-primer",
    "name": "Sipeed Tang Primer",
    "vendor": "Sipeed",
    "family": "FPGA",
    "device": "EG4S20BG256",
    "packageName": "unknown",
    "fpgaId": "eg4s20bg256",
    "constraintsFile": "xdc",
    "synthesisFlow": "vivado",
    "toolchain": "vivado",
    "program": "vivado",
    "source": "sipeed_tang_primer",
    "clock": {
      "name": "clk24",
      "pin": "unknown",
      "frequency": 24000000
    },
    "pins": []
  }
];

export const litexCatalogBoards: BoardDefinition[] =
  LITEX_CATALOG_SPECS.map(makeCatalogBoard);

function makeCatalogGroup({
  id,
  name,
  vendor,
  device,
  boardIds,
}: {
  id: string;
  name: string;
  vendor: string;
  device: string;
  boardIds: string[];
}): BoardGroupDefinition {
  return {
    id,
    name,
    vendor,
    device,
    variants: boardIds
      .map((id) => litexCatalogBoards.find((board) => board.id === id))
      .filter((board): board is BoardDefinition => Boolean(board))
      .map((board) => ({
        id: board.id,
        name: board.name,
        fpga: board.device,
      })),
  };
}

function getCatalogBoard(id: string): BoardDefinition {
  const board = litexCatalogBoards.find(
    (catalogBoard) => catalogBoard.id === id,
  );

  if (!board) {
    throw new Error(`Missing LiteX catalog board: ${id}`);
  }

  return board;
}

export const litexCatalogBoardGroups = [
  makeCatalogGroup({
    id: "sitlinv-stlv7325",
    name: "SITLINV STLV7325",
    vendor: "SITLINV",
    device: "Kintex-7",
    boardIds: ["sitlinv-stlv7325-v1", "sitlinv-stlv7325-v2"],
  }),
  makeCatalogGroup({
    id: "alchitry-au-family",
    name: "Alchitry Au",
    vendor: "Alchitry",
    device: "Artix-7",
    boardIds: ["alchitry-au", "alchitry-au-v2"],
  }),
  makeCatalogGroup({
    id: "aliexpress-xc7k",
    name: "AliExpress XC7K",
    vendor: "AliExpress",
    device: "Kintex-7",
    boardIds: ["aliexpress-xc7k70t", "aliexpress-xc7k420t"],
  }),
  makeCatalogGroup({
    id: "alinx-ax70xx",
    name: "ALINX AX70xx",
    vendor: "ALINX",
    device: "Zynq-7000",
    boardIds: ["alinx-ax7010", "alinx-ax7020"],
  }),
  makeCatalogGroup({
    id: "colorlight-5a-75",
    name: "Colorlight 5A-75",
    vendor: "Colorlight",
    device: "ECP5",
    boardIds: ["colorlight-5a-75b", "colorlight-5a-75e"],
  }),
  makeCatalogGroup({
    id: "lambdaconcept-pcie-screamer-family",
    name: "LambdaConcept PCIe Screamer",
    vendor: "LambdaConcept",
    device: "Artix-7",
    boardIds: ["lambdaconcept-pcie-screamer", "lambdaconcept-pcie-screamer-m2"],
  }),
  makeCatalogGroup({
    id: "machdyne-mozart",
    name: "Machdyne Mozart",
    vendor: "Machdyne",
    device: "FPGA modules",
    boardIds: [
      "machdyne-mozart-ml1",
      "machdyne-mozart-ml2",
      "machdyne-mozart-mx1",
      "machdyne-mozart-mx2",
    ],
  }),
  makeCatalogGroup({
    id: "radiona-ulx4m-v2",
    name: "Radiona ULX4M V2",
    vendor: "Radiona",
    device: "ECP5",
    boardIds: ["radiona-ulx4m-ld-v2", "radiona-ulx4m-ls-v2"],
  }),
  makeCatalogGroup({
    id: "qmtech-5cefa",
    name: "QMTech 5CEFA",
    vendor: "QMTech",
    device: "Cyclone V",
    boardIds: ["qmtech-5cefa2", "qmtech-5cefa5"],
  }),
  makeCatalogGroup({
    id: "qmtech-artix7",
    name: "QMTech Artix-7",
    vendor: "QMTech",
    device: "Artix-7",
    boardIds: ["qmtech-artix7-fbg484", "qmtech-artix7-fgg676"],
  }),
  makeCatalogGroup({
    id: "sipeed-tang-mega-138k",
    name: "Sipeed Tang Mega 138K",
    vendor: "Sipeed",
    device: "Gowin",
    boardIds: ["sipeed-tang-mega-138k", "sipeed-tang-mega-138k-pro"],
  }),
  makeCatalogGroup({
    id: "sipeed-tang-primer",
    name: "Sipeed Tang Primer",
    vendor: "Sipeed",
    device: "Gowin",
    boardIds: [
      "sipeed-tang-primer",
      "sipeed-tang-primer-20k",
      "sipeed-tang-primer-25k",
    ],
  }),
  getCatalogBoard("sitlinv-a-e115fb"),
  getCatalogBoard("sitlinv-xc7k420t"),
  getCatalogBoard("sqrl-xcu1525"),
  getCatalogBoard("terasic-atum-a3-nano"),
  getCatalogBoard("terasic-de0nano"),
  getCatalogBoard("terasic-de1soc"),
  getCatalogBoard("terasic-de2-115"),
  getCatalogBoard("terasic-de10lite"),
  getCatalogBoard("terasic-de10nano"),
  getCatalogBoard("terasic-deca"),
  getCatalogBoard("terasic-sockit"),
  getCatalogBoard("trenz-c10lpek"),
  getCatalogBoard("trenz-c10lprefkit"),
  getCatalogBoard("trenz-cr00010"),
  getCatalogBoard("trenz-cyc1000"),
  getCatalogBoard("trenz-max1000"),
  getCatalogBoard("trenz-mega65"),
  getCatalogBoard("trenz-mf-c10lp-001"),
  getCatalogBoard("trenz-mf-max10-001"),
  getCatalogBoard("trenz-mf001-intel"),
  getCatalogBoard("trenz-s7mini"),
  getCatalogBoard("trenz-smf2000"),
  getCatalogBoard("trenz-te0710"),
  getCatalogBoard("trenz-te0711"),
  getCatalogBoard("trenz-te0725"),
  getCatalogBoard("trenz-te0741"),
  getCatalogBoard("trenz-te0890"),
  getCatalogBoard("trenz-tec0117"),
  getCatalogBoard("trenz-tem0006"),
  getCatalogBoard("tul-pynq-z2"),
  getCatalogBoard("xilinx-alveo-u200"),
  getCatalogBoard("xilinx-alveo-u250"),
  getCatalogBoard("xilinx-alveo-u280"),
  getCatalogBoard("xilinx-kc705"),
  getCatalogBoard("xilinx-kcu105"),
  getCatalogBoard("xilinx-kcu116"),
  getCatalogBoard("xilinx-kv260"),
  getCatalogBoard("xilinx-sp605"),
  getCatalogBoard("xilinx-vc707"),
  getCatalogBoard("xilinx-vcu118"),
  getCatalogBoard("xilinx-vcu128"),
  getCatalogBoard("xilinx-zc706"),
  getCatalogBoard("xilinx-zcu102"),
  getCatalogBoard("xilinx-zcu104"),
  getCatalogBoard("xilinx-zcu106"),
  getCatalogBoard("xilinx-zcu216"),
  getCatalogBoard("ypcb-00338-1p1"),
  getCatalogBoard("ztex213"),
  getCatalogBoard("adi-adrv2crr-fmc"),
  getCatalogBoard("adi-plutosdr"),
  getCatalogBoard("alchitry-cu"),
  getCatalogBoard("alchitry-mojo"),
  getCatalogBoard("alchitry-pt-v2"),
  getCatalogBoard("alibaba-vu13p"),
  getCatalogBoard("alibaba-xcku3p"),
  getCatalogBoard("alientek-davincipro"),
  getCatalogBoard("alinx-ax7203"),
  getCatalogBoard("alinx-axau15"),
  getCatalogBoard("alinx-axu2cga"),
  getCatalogBoard("altera-agilex5e-065b-premium-devkit"),
  getCatalogBoard("analog-pocket"),
  getCatalogBoard("antmicro-artix-dc-scm"),
  getCatalogBoard("antmicro-datacenter-ddr4-test-board"),
  getCatalogBoard("antmicro-lpddr4-test-board"),
  getCatalogBoard("antmicro-sdi-mipi-video-converter"),
  getCatalogBoard("arduino-mkrvidor4000"),
  getCatalogBoard("arrow-axe5000"),
  getCatalogBoard("avalanche"),
  getCatalogBoard("avnet-aesku40"),
  getCatalogBoard("berkeleylab-marble"),
  getCatalogBoard("berkeleylab-marblemini"),
  getCatalogBoard("berkeleylab-obsidian"),
  getCatalogBoard("bochenjingxin-kintex7-basec"),
  getCatalogBoard("brisbane-silicon-brs-100-gw1nr9"),
  getCatalogBoard("camlink-4k"),
  getCatalogBoard("colognechip-gatemate-evb"),
  getCatalogBoard("decklink-intensity-pro-4k"),
  getCatalogBoard("decklink-mini-4k"),
  getCatalogBoard("decklink-quad-hdmi-recorder"),
  getCatalogBoard("digilent-arty-s7"),
  getCatalogBoard("digilent-arty-z7"),
  getCatalogBoard("digilent-atlys"),
  getCatalogBoard("digilent-basys3"),
  getCatalogBoard("digilent-cmod-a7"),
  getCatalogBoard("digilent-genesys2"),
  getCatalogBoard("digilent-netfpga-sume"),
  getCatalogBoard("digilent-nexys-video"),
  getCatalogBoard("digilent-nexys4"),
  getCatalogBoard("digilent-nexys4ddr"),
  getCatalogBoard("digilent-pynq-z1"),
  getCatalogBoard("digilent-zedboard"),
  getCatalogBoard("digilent-zybo-z7"),
  getCatalogBoard("ebaz4205"),
  getCatalogBoard("efinix-t8f81-dev-kit"),
  getCatalogBoard("efinix-ti375-c529-dev-kit"),
  getCatalogBoard("efinix-titanium-ti60-f225-dev-kit"),
  getCatalogBoard("efinix-trion-t20-bga256-dev-kit"),
  getCatalogBoard("efinix-trion-t20-mipi-dev-kit"),
  getCatalogBoard("efinix-trion-t120-bga576-dev-kit"),
  getCatalogBoard("efinix-tz170-j484-dev-kit"),
  getCatalogBoard("efinix-xyloni-dev-kit"),
  getCatalogBoard("ego1"),
  getCatalogBoard("embedfire-rise-pro"),
  getCatalogBoard("enclustra-mercury-kx2"),
  getCatalogBoard("enclustra-mercury-xu5"),
  getCatalogBoard("enclustra-mercury-xu8-pe3"),
  getCatalogBoard("enclustra-st1"),
  getCatalogBoard("fairwaves-xtrx"),
  getCatalogBoard("fpc-iii"),
  getCatalogBoard("fpgawars-alhambra2"),
  getCatalogBoard("gadgetfactory-papilio-pro"),
  getCatalogBoard("hackaday-hadbadge"),
  getCatalogBoard("hseda-xc7a35t"),
  getCatalogBoard("hyvision-pcie-opt01-revf"),
  getCatalogBoard("intergalaktik-ulx5m-gs"),
  getCatalogBoard("isx-im1283"),
  getCatalogBoard("jungle-electronics-fireant"),
  getCatalogBoard("kosagi-fomu-evt"),
  getCatalogBoard("kosagi-fomu-hacker"),
  getCatalogBoard("krtkl-snickerdoodle"),
  getCatalogBoard("lattice-certuspro-nx-evn"),
  getCatalogBoard("lattice-certuspro-nx-versa"),
  getCatalogBoard("lattice-certuspro-nx-vvml"),
  getCatalogBoard("lattice-crosslink-nx-evn"),
  getCatalogBoard("lattice-crosslink-nx-vip"),
  getCatalogBoard("lattice-ecp5-vip"),
  getCatalogBoard("lattice-machxo3"),
  getCatalogBoard("lckfb-ljpi"),
  getCatalogBoard("limesdr-mini-v2"),
  getCatalogBoard("limesdr-xtrx"),
  getCatalogBoard("linsn-rv901t"),
  getCatalogBoard("litex-acorn-baseboard"),
  getCatalogBoard("logicbone"),
  getCatalogBoard("machdyne-kolsch"),
  getCatalogBoard("machdyne-konfekt"),
  getCatalogBoard("machdyne-kopflos"),
  getCatalogBoard("machdyne-krote"),
  getCatalogBoard("machdyne-lakritz"),
  getCatalogBoard("machdyne-minze"),
  getCatalogBoard("machdyne-noir"),
  getCatalogBoard("machdyne-schoko"),
  getCatalogBoard("machdyne-vanille"),
  getCatalogBoard("machdyne-vivaldi-ml1"),
  getCatalogBoard("micronova-mercury2"),
  getCatalogBoard("microphase-a7-lite"),
  getCatalogBoard("microsoft-catapult-v3"),
  getCatalogBoard("mist"),
  getCatalogBoard("mlkpai-fs01-dr1v90m"),
  getCatalogBoard("mnt-rkx7"),
  getCatalogBoard("modretro-chromatic"),
  getCatalogBoard("myir-myc-j7a100t"),
  getCatalogBoard("myminieye-runber"),
  getCatalogBoard("newae-cw305"),
  getCatalogBoard("numato-aller"),
  getCatalogBoard("numato-mimas-a7"),
  getCatalogBoard("numato-nereid"),
  getCatalogBoard("numato-tagus"),
  getCatalogBoard("ocp-tap-timecard"),
  getCatalogBoard("olimex-gatemate-a1-evb"),
  getCatalogBoard("opalkelly-xem8320"),
  getCatalogBoard("opensourcesdrlab-kintex7"),
  getCatalogBoard("pano-logic-g2"),
  getCatalogBoard("puzhi-p7-starlite"),
  getCatalogBoard("puzhi-pz-a7xxt-kfb"),
  getCatalogBoard("qmtech-10cl006"),
  getCatalogBoard("qmtech-cyclone10-starterkit"),
  getCatalogBoard("qmtech-daughterboard"),
  getCatalogBoard("qmtech-ep4ce15-starter-kit"),
  getCatalogBoard("qmtech-ep4cex5"),
  getCatalogBoard("qmtech-ep4cgx150"),
  getCatalogBoard("qmtech-kintex7-devboard"),
  getCatalogBoard("qmtech-rp2040-daughterboard"),
  getCatalogBoard("qmtech-wukong"),
  getCatalogBoard("qmtech-xc7a35t"),
  getCatalogBoard("qmtech-xc7k325t"),
  getCatalogBoard("quicklogic-quickfeather"),
  getCatalogBoard("qwertyembedded-beaglewire"),
  getCatalogBoard("rcs-arctic-tern-bmc-card"),
  getCatalogBoard("redpitaya"),
  getCatalogBoard("rz-easyfpga"),
  getCatalogBoard("saanlima-pipistrello"),
  getCatalogBoard("scarabhardware-minispartan6"),
  getCatalogBoard("seeedstudio-spartan-edge-accelerator"),
  getCatalogBoard("siglent-sds1104xe"),
  getCatalogBoard("signaloid-c0-microsd"),
  getCatalogBoard("sipeed-slogic16u3"),
  getCatalogBoard("sipeed-tang-console"),
  getCatalogBoard("sipeed-tang-nano-4k"),
  getCatalogBoard("sipeed-tang-nano"),
];
