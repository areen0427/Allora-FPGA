export type FpgaDevice = {
  id: string;
  vendor: string;
  family: string;
  device: string;
  package: string;
  logicCells?: number;
  bramKb?: number;
  dsp?: number;
  pll?: number;
  notes?: string;
};

export const FPGAS: FpgaDevice[] = [
  {
    id: "ice40up5k-sg48",
    vendor: "Lattice",
    family: "iCE40 UltraPlus",
    device: "iCE40UP5K",
    package: "SG48",
    logicCells: 5280,
    bramKb: 120,
    dsp: 8,
    pll: 1,
  },

  {
    id: "lfe5u-12f-cabga381",
    vendor: "Lattice",
    family: "ECP5",
    device: "LFE5U-12F",
    package: "CABGA381",
    logicCells: 12000,
    bramKb: 476,
    dsp: 28,
    pll: 2,
  },

  {
    id: "lfe5u-25f-cabga381",
    vendor: "Lattice",
    family: "ECP5",
    device: "LFE5U-25F",
    package: "CABGA381",
    logicCells: 24000,
    bramKb: 972,
    dsp: 56,
    pll: 2,
  },

  {
    id: "lfe5u-45f-cabga381",
    vendor: "Lattice",
    family: "ECP5",
    device: "LFE5U-45F",
    package: "CABGA381",
    logicCells: 44000,
    bramKb: 1944,
    dsp: 84,
    pll: 2,
  },

  {
    id: "lfe5u-85f-cabga381",
    vendor: "Lattice",
    family: "ECP5",
    device: "LFE5U-85F",
    package: "CABGA381",
    logicCells: 84000,
    bramKb: 3798,
    dsp: 156,
    pll: 2,
  },
];

export function getFpgaById(id: string) {
  return FPGAS.find((fpga) => fpga.id === id);
}
