import { parseImportSources, type ImportSource, type OutputDeclaration } from "./portImport";

export type TestbenchSignal = OutputDeclaration & {
  direction: "input" | "output" | "inout";
};

export type TestbenchDesign = {
  moduleName: string;
  signals: TestbenchSignal[];
  error?: string;
};

export type TestbenchConfiguration = {
  clockSignal: string;
  frequencyMHz: string;
  resetSignal: string;
  resetPolarity: "high" | "low";
  resetDurationNs: string;
  simulationDurationNs: string;
};

type Timing = {
  halfPeriodPs?: number;
  resetReleasePs?: number;
  simulationPs: number;
};

type ConfigurationField = keyof TestbenchConfiguration | "design";
export type TestbenchValidation = {
  errors: Partial<Record<ConfigurationField, string>>;
  timing?: Timing;
};

const MAX_TIME_NS = 1_000_000_000;
const identifier = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** Reuse the bounded interface reader rather than guessing unresolved widths. */
export function inspectTestbenchSource(source: ImportSource | null) {
  if (!source) return { designs: [], error: "Select a Verilog or SystemVerilog design file first." };
  if (!/\.(?:v|sv)$/i.test(source.name)) {
    return { designs: [], error: "Testbench creation and execution currently support Verilog and SystemVerilog designs. VHDL is not supported here." };
  }
  try {
    // A source's time unit does not affect its port declarations. Other
    // preprocessing remains unsupported by the shared interface reader.
    const withoutComments = source.content.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, token => token.startsWith('"') ? '""' : " ");
    const content = withoutComments
      .replace(/^[ \t]*`timescale\b[^\r\n]*$/gm, "")
      // The default Empty Project uses the legal portless `module top;` form.
      .replace(/(\bmodule\s+(?:automatic\s+)?[A-Za-z_][A-Za-z0-9_$]*)\s*;/g, "$1();");
    // The shared importer treats an empty non-ANSI list as an empty identifier.
    // Handle genuine portless modules locally, without accepting stray ports.
    const portless = new Set([...content.matchAll(/\bmodule\s+(?:automatic\s+)?([A-Za-z_][A-Za-z0-9_$]*)\s*\(\s*\)\s*;([\s\S]*?)\bendmodule\b/g)]
      .filter(match => !/\b(?:input|output|inout)\b/.test(match[2].replace(/\b(function|task)\b[\s\S]*?\bend(?:function|task)\b/g, "")))
      .map(match => match[1]));
    const designs: TestbenchDesign[] = parseImportSources([{ ...source, content }], true).map(unit => ({
      moduleName: unit.name,
      signals: unit.outputs as TestbenchSignal[],
      ...(unit.error && !(portless.has(unit.name) && unit.error === "Unsupported non-ANSI port list.")
        ? { error: unit.error.replaceAll("output", "port") } : {}),
    }));
    return { designs };
  } catch (error) {
    return { designs: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function getTestbenchInputSignals(design: TestbenchDesign) {
  return design.signals.filter(signal => signal.direction === "input" && signal.width === 1 && !signal.indices);
}

export function defaultTestbenchConfiguration(design?: TestbenchDesign): TestbenchConfiguration {
  const inputs = design ? getTestbenchInputSignals(design) : [];
  const clockSignal = inputs.find(signal => /^(?:clk|clock|sysclk)$/i.test(signal.name))?.name ?? "";
  const resetSignal = inputs.find(signal => /^(?:rst|reset|rst_n|reset_n)$/i.test(signal.name))?.name ?? "";
  return {
    clockSignal,
    frequencyMHz: "100",
    resetSignal,
    resetPolarity: /_n$/i.test(resetSignal) ? "low" : "high",
    resetDurationNs: "20",
    simulationDurationNs: "220",
  };
}

function decimal(value: string) {
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ? Number(value) : NaN;
}

function timeInPs(value: string) {
  const ns = decimal(value);
  const ps = Math.round(ns * 1_000);
  return Number.isFinite(ns) && ns > 0 && ns <= MAX_TIME_NS && ps >= 1
    && Math.abs(ns * 1_000 - ps) < 0.00001 ? ps : undefined;
}

export function formatTestbenchTime(ps: number) {
  return (ps / 1_000).toFixed(3).replace(/\.?0+$/, "");
}

export function validateTestbenchConfiguration(
  design: TestbenchDesign | undefined,
  configuration: TestbenchConfiguration,
): TestbenchValidation {
  const errors: TestbenchValidation["errors"] = {};
  if (!design) errors.design = "Choose a design module.";
  else if (design.error) errors.design = design.error;
  else if (!identifier.test(design.moduleName)) errors.design = "The design module name is unsupported.";
  const inputs = design ? getTestbenchInputSignals(design).map(signal => signal.name) : [];
  const { clockSignal, resetSignal } = configuration;
  if (clockSignal && !inputs.includes(clockSignal)) errors.clockSignal = "Choose a scalar input port for the clock.";
  if (resetSignal && !inputs.includes(resetSignal)) errors.resetSignal = "Choose a scalar input port for reset.";
  if (resetSignal && resetSignal === clockSignal) errors.resetSignal = "Clock and reset must use different input ports.";
  if (resetSignal && !["high", "low"].includes(configuration.resetPolarity)) errors.resetPolarity = "Choose an active reset level.";

  let halfPeriodPs: number | undefined;
  if (clockSignal) {
    const frequency = decimal(configuration.frequencyMHz);
    if (!Number.isFinite(frequency) || frequency < 0.001 || frequency > 250_000) {
      errors.frequencyMHz = "Enter a frequency from 0.001 to 250,000 MHz.";
    } else {
      // A half period of at least 2 ps leaves a 1 ps reset-release margin.
      halfPeriodPs = Math.round(500_000 / frequency);
    }
  }

  const simulationPs = timeInPs(configuration.simulationDurationNs);
  if (simulationPs === undefined) errors.simulationDurationNs = "Enter a positive time up to 1,000,000,000 ns, with at most 3 decimal places.";
  let resetReleasePs: number | undefined;
  if (resetSignal) {
    const resetPs = timeInPs(configuration.resetDurationNs);
    if (resetPs === undefined) errors.resetDurationNs = "Enter a positive reset duration in ns, with at most 3 decimal places.";
    else {
      // The generated clock begins low. Deassert 1 ps after the next falling
      // edge, never on the DUT's rising clock edge or in the same delta cycle.
      resetReleasePs = halfPeriodPs
        ? (Math.floor(resetPs / (2 * halfPeriodPs)) + 1) * 2 * halfPeriodPs + 1
        : resetPs;
      if (simulationPs !== undefined && simulationPs <= resetReleasePs) {
        errors.simulationDurationNs = `Simulation must run beyond reset release at ${formatTestbenchTime(resetReleasePs)} ns.`;
      }
    }
  }
  if (simulationPs !== undefined && halfPeriodPs && simulationPs <= halfPeriodPs) {
    errors.simulationDurationNs = "Simulation must include at least one clock edge.";
  }
  return Object.keys(errors).length || simulationPs === undefined
    ? { errors }
    : { errors, timing: { halfPeriodPs, resetReleasePs, simulationPs } };
}

/** File and module names must both remain unique when creating another bench. */
export function uniqueTestbenchName(moduleName: string, files: ImportSource[]) {
  const names = new Set(files.map(file => file.name.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase()));
  const modules = new Set(files.flatMap(file => {
    if (!/\.(?:v|sv)$/i.test(file.name)) return [];
    const content = file.content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
    return [...content.matchAll(/\bmodule\s+(?:automatic\s+)?([A-Za-z_][A-Za-z0-9_$]*)/g)].map(match => match[1]);
  }));
  const stem = `${moduleName}_tb`;
  let name = stem;
  let suffix = 2;
  while (names.has(`${name}.sv`.toLowerCase()) || modules.has(name)) name = `${stem}_${suffix++}`;
  return { fileName: `${name}.sv`, moduleName: name };
}

export function createTestbenchScaffold(
  design: TestbenchDesign,
  configuration: TestbenchConfiguration,
  files: ImportSource[],
  boardName: string,
) {
  const validation = validateTestbenchConfiguration(design, configuration);
  if (!validation.timing) throw new Error(Object.values(validation.errors).join(" "));
  const { halfPeriodPs, resetReleasePs, simulationPs } = validation.timing;
  const { fileName, moduleName } = uniqueTestbenchName(design.moduleName, files);
  const usedNames = new Set(design.signals.map(signal => signal.name));
  let instance = "dut";
  while (usedNames.has(instance)) instance += "_instance";
  const asserted = configuration.resetPolarity === "low" ? "0" : "1";
  const released = configuration.resetPolarity === "low" ? "1" : "0";
  const declarations = design.signals.map(signal => {
    const range = signal.indices ? ` [${signal.indices[0]}:${signal.indices.at(-1)}]` : "";
    const value = signal.name === configuration.resetSignal ? asserted : "0";
    return `  ${signal.direction === "input" ? "reg" : "wire"}${range} ${signal.name}${signal.direction === "input" ? ` = ${signal.width}'d${value}` : ""};`;
  }).join("\n");
  const connections = design.signals.map(signal => `    .${signal.name}(${signal.name})`).join(",\n");
  const clock = configuration.clockSignal && halfPeriodPs
    ? `\n  always #${formatTestbenchTime(halfPeriodPs)} ${configuration.clockSignal} = ~${configuration.clockSignal};\n`
    : "";
  const reset = configuration.resetSignal && resetReleasePs
    ? `\n  initial begin\n    // ${halfPeriodPs ? "Release reset 1 ps after a falling clock edge." : "Release reset after the configured duration."}\n    #${formatTestbenchTime(resetReleasePs)} ${configuration.resetSignal} = 1'b${released};\n  end\n`
    : "";
  const content = `\`timescale 1ns / 1ps

module ${moduleName};
${declarations}

  ${design.moduleName} ${instance} (
${connections}
  );
${clock}${reset}
  initial begin
    $dumpfile("waveform.vcd");
    $dumpvars(0, ${moduleName});

    // ${boardName.replace(/[\r\n]/g, " ")} simulation stimulus
    // Add input stimulus and checks here.
    #${formatTestbenchTime(simulationPs)};
    $finish;
  end
endmodule
`;
  return { fileName, moduleName, content };
}
