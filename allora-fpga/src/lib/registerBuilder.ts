/** Register Builder V1: byte-addressed, full-word native bus; no protocol adapter. */
export type Access = "RW" | "RO" | "WO" | "W1C";
export type RegisterField = {
  id: string;
  name: string;
  lsb: number;
  msb: number;
  access: Access;
  reset: string;
  description: string;
};
export type Register = {
  id: string;
  name: string;
  offset: string;
  width: number;
  access: Access;
  reset: string;
  description: string;
  fields: RegisterField[];
};
export type RegisterMap = {
  name: string;
  addressWidth: number;
  dataWidth: number;
  resetActiveLow: boolean;
  registers: Register[];
};
export type Port = {
  name: string;
  direction: "input" | "output";
  width: number;
  description?: string;
};
export type Integration = {
  topModule: string;
  ports: Port[];
  clock: string;
  reset: string;
  designInputs: Record<string, string>;
  bankInputs: Record<string, string>;
};
export type RegisterManifest = {
  schemaVersion: 1;
  map: RegisterMap;
  outputs: { path: string; hash: string }[];
  generatedKey?: string;
  integration?: Integration;
};
export type Issue = { registerId?: string; fieldId?: string; message: string };
export const manifestPath = "Register_Map/register-builder.json";
export const emptyMap = (): RegisterMap => ({
  name: "register_map",
  addressWidth: 16,
  dataWidth: 32,
  resetActiveLow: false,
  registers: [],
});
const keywords = new Set(
  "always always_comb always_ff always_latch and assign automatic begin bit buf case casex casez cell config const deassign default defparam design disable do edge else end endcase endconfig endfunction endgenerate endmodule endprimitive endspecify endtable endtask enum event export for force forever fork function generate genvar highz0 highz1 if import incdir include initial inout input integer interface join large liblist library localparam logic macromodule medium modport module nand negedge nmos nor not notif0 notif1 or output package packed parameter pmos posedge primitive pull0 pull1 pulldown pullup rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared signed small specify specparam static string strong0 strong1 struct supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg typedef union unsigned use vectored wait wand weak0 weak1 while wire wor xnor xor int longint shortint byte void return class endclass virtual protected local rand constraint property sequence assert assume cover inside dist priority unique endinterface endpackage endproperty endsequence null this super new int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t".split(
    /\s+/,
  ),
);
// Additional SystemVerilog assertion, class, coverage, and net-type keywords.
for (const word of "accept_on alias before bins binsof break chandle checker clocking context continue covergroup coverpoint cross endchecker endclocking endgroup expect extends extern final first_match foreach global ignore_bins illegal_bins implements implies interconnect intersect join_any join_none let localparam matches nettype nexttime null option property pure randc randcase randsequence ref reject_on restrict s_always s_eventually s_nexttime s_until s_until_with shortreal soft solve super sync_accept_on sync_reject_on tagged throughout timeprecision timeunit type unique0 until until_with untyped uwire var virtual wait_order wildcard with within".split(
  " ",
))
  keywords.add(word);
export function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(value) &&
    !keywords.has(value)
  );
}
export function unsigned(value: string): bigint {
  if (!/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)$/.test(value))
    throw new Error("Use unsigned decimal, 0x hex, or 0b binary.");
  return BigInt(value);
}
const integer = (value: number, low: number, high: number) =>
  Number.isInteger(value) && value >= low && value <= high;
const mask = (width: number) => (1n << BigInt(width)) - 1n;
const hex = (value: bigint, width: number) =>
  `${width}'h${value.toString(16).padStart(Math.ceil(width / 4), "0")}`;
const comment = (value: string) =>
  value.replace(/[\r\n\u2028\u2029]/g, " ").replaceAll("*/", "* /");
export function validateMap(map: RegisterMap): Issue[] {
  const issues: Issue[] = [];
  const add = (message: string, registerId?: string, fieldId?: string) =>
    issues.push({ message, registerId, fieldId });
  if (!validIdentifier(map.name))
    add("Map name must be a non-keyword HDL identifier (up to 60 characters).");
  const normalizedModule = map.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    normalizedModule.includes("testbench") ||
    normalizedModule.startsWith("tb") ||
    normalizedModule.endsWith("tb") ||
    /(^|[_\-.])tb([_\-.]|$)/i.test(map.name)
  )
    add(
      "Map name matches Allora's testbench naming convention. Choose a design module name so generated HDL participates in builds.",
    );
  if (!integer(map.addressWidth, 1, 32))
    add("Address width must be 1–32 bits.");
  if (![8, 16, 32, 64].includes(map.dataWidth))
    add("Data width must be 8, 16, 32, or 64 bits.");
  if (typeof map.resetActiveLow !== "boolean")
    add("Reset polarity must be specified.");
  if (!map.registers.length) add("Add at least one register.");
  if (map.registers.length > 256) add("V1 supports up to 256 registers.");
  const names = new Set<string>(),
    ids = new Set<string>(),
    ranges: { start: bigint; end: bigint; name: string }[] = [];
  const checkReset = (
    value: string,
    width: number,
    label: string,
    rid: string,
    fid?: string,
  ) => {
    try {
      const n = unsigned(value);
      if (!integer(width, 1, 64) || n > mask(width))
        add(`${label}: reset exceeds its ${width}-bit width.`, rid, fid);
    } catch {
      add(
        `${label}: invalid reset value. Use unsigned decimal, 0x hex, or 0b binary.`,
        rid,
        fid,
      );
    }
  };
  for (const r of map.registers) {
    if (!validIdentifier(r.name))
      add(`${r.name || "Register"}: invalid HDL identifier.`, r.id);
    if (names.has(r.name.toUpperCase()))
      add(
        `${r.name}: duplicate register name (C constants are case-insensitive).`,
        r.id,
      );
    names.add(r.name.toUpperCase());
    if (!r.id || ids.has(r.id)) add("Register IDs must be unique.", r.id);
    ids.add(r.id);
    if (!integer(r.width, 1, map.dataWidth))
      add(`${r.name}: width must be 1–${map.dataWidth} bits.`, r.id);
    if (!["RW", "RO", "WO", "W1C"].includes(r.access))
      add(`${r.name}: invalid access mode.`, r.id);
    checkReset(r.reset, r.width, r.name, r.id);
    try {
      const start = unsigned(r.offset),
        bytes = BigInt(map.dataWidth / 8),
        end = start + bytes;
      if (start % bytes !== 0n)
        add(`${r.name}: address must be aligned to ${bytes} bytes.`, r.id);
      if (
        !integer(map.addressWidth, 1, 32) ||
        end > 1n << BigInt(map.addressWidth)
      )
        add(`${r.name}: register exceeds the address space.`, r.id);
      for (const other of ranges)
        if (start < other.end && end > other.start)
          add(
            `${r.name}: ${start === other.start ? "duplicate address" : "address overlap"} with ${other.name}.`,
            r.id,
          );
      ranges.push({ start, end, name: r.name });
    } catch {
      add(`${r.name}: invalid address/offset.`, r.id);
    }
    const fieldNames = new Set<string>(),
      fieldIds = new Set<string>(),
      bits = new Set<number>();
    if (r.fields.length > 64) add(`${r.name}: too many fields.`, r.id);
    for (const f of r.fields) {
      const label = `${r.name}.${f.name}`;
      if (!validIdentifier(f.name))
        add(`${label}: invalid HDL identifier.`, r.id, f.id);
      if (fieldNames.has(f.name.toUpperCase()))
        add(`${label}: duplicate field name.`, r.id, f.id);
      fieldNames.add(f.name.toUpperCase());
      if (!f.id || fieldIds.has(f.id))
        add(`${label}: duplicate field ID.`, r.id, f.id);
      fieldIds.add(f.id);
      if (!["RW", "RO", "WO", "W1C"].includes(f.access))
        add(`${label}: invalid access mode.`, r.id, f.id);
      if (!integer(f.lsb, 0, 63) || !integer(f.msb, 0, 63) || f.msb < f.lsb)
        add(`${label}: invalid bit range.`, r.id, f.id);
      else {
        if (f.msb >= r.width)
          add(`${label}: field outside register width.`, r.id, f.id);
        for (let bit = f.lsb; bit <= f.msb; bit++) {
          if (bits.has(bit)) {
            add(`${label}: overlapping bit fields.`, r.id, f.id);
            break;
          }
        }
        for (let bit = f.lsb; bit <= f.msb; bit++) bits.add(bit);
      }
      checkReset(f.reset, f.msb - f.lsb + 1, label, r.id, f.id);
    }
  }
  // C macro identifiers use flattened names; detect cross-register/field collisions.
  const macros = new Set<string>();
  const macro = (name: string) => {
    if (macros.has(name))
      add(`Generated C constant ${name} collides; rename a register or field.`);
    macros.add(name);
  };
  for (const r of map.registers) {
    const prefix = r.name.toUpperCase();
    for (const suffix of ["OFFSET", "WIDTH", "MASK", "RESET"])
      macro(`${prefix}_${suffix}`);
    for (const f of r.fields)
      for (const suffix of ["SHIFT", "WIDTH", "MASK", "RESET"])
        macro(`${prefix}_${f.name.toUpperCase()}_${suffix}`);
  }
  // Generated signal names must also be unique; composite register/field names can collide.
  if (!issues.length) {
    const seen = new Set<string>();
    for (const p of bankPorts(map)) {
      if (seen.has(p.name))
        add(`Generated signal ${p.name} collides; rename a register or field.`);
      seen.add(p.name);
    }
  }
  return issues;
}
/** Structural parsing accepts semantically invalid drafts so users can reopen and repair them. */
export function parseManifest(text: string): RegisterManifest {
  const v = JSON.parse(text) as RegisterManifest;
  const str = (x: unknown) => typeof x === "string";
  if (
    !v ||
    v.schemaVersion !== 1 ||
    !v.map ||
    !str(v.map.name) ||
    typeof v.map.addressWidth !== "number" ||
    typeof v.map.dataWidth !== "number" ||
    typeof v.map.resetActiveLow !== "boolean" ||
    !Array.isArray(v.map.registers) ||
    v.map.registers.length > 256 ||
    !Array.isArray(v.outputs)
  )
    throw new Error("Unsupported or malformed Register Builder manifest.");
  for (const r of v.map.registers) {
    if (
      !r ||
      ![r.id, r.name, r.offset, r.access, r.reset, r.description].every(str) ||
      typeof r.width !== "number" ||
      !Array.isArray(r.fields) ||
      r.fields.length > 64
    )
      throw new Error("Malformed register definition.");
    for (const f of r.fields)
      if (
        !f ||
        ![f.id, f.name, f.access, f.reset, f.description].every(str) ||
        typeof f.lsb !== "number" ||
        typeof f.msb !== "number"
      )
        throw new Error("Malformed field definition.");
  }
  const paths = new Set<string>();
  for (const o of v.outputs) {
    if (
      !o ||
      !/^Register_Map\/[A-Za-z_][A-Za-z0-9_]*\.(sv|h|json|txt)$/.test(o.path) ||
      o.path === manifestPath ||
      !/^[a-f0-9]{64}$/.test(o.hash) ||
      paths.has(o.path)
    )
      throw new Error("Invalid generated-file ownership record.");
    paths.add(o.path);
  }
  if (
    v.integration &&
    (!validIdentifier(v.integration.topModule) ||
      !Array.isArray(v.integration.ports) ||
      typeof v.integration.clock !== "string" ||
      typeof v.integration.reset !== "string" ||
      !v.integration.designInputs ||
      typeof v.integration.designInputs !== "object" ||
      !v.integration.bankInputs ||
      typeof v.integration.bankInputs !== "object")
  )
    throw new Error("Malformed integration metadata.");
  if (v.generatedKey !== undefined && typeof v.generatedKey !== "string")
    throw new Error("Invalid generation record.");
  if (v.integration) {
    const i = v.integration;
    if (
      i.ports.some(
        (p) =>
          !p ||
          !validIdentifier(p.name) ||
          !["input", "output"].includes(p.direction) ||
          !integer(p.width, 1, 64),
      ) ||
      Array.isArray(i.designInputs) ||
      Array.isArray(i.bankInputs) ||
      Object.values(i.designInputs).some(
        (value) => typeof value !== "string",
      ) ||
      Object.values(i.bankInputs).some((value) => typeof value !== "string")
    )
      throw new Error("Malformed integration port or connection.");
  }
  return v;
}
export function serializeManifest(manifest: RegisterManifest) {
  return JSON.stringify(manifest, null, 2) + "\n";
}
export function generationKey(map: RegisterMap, integration?: Integration) {
  return JSON.stringify({ map, integration });
}
type Segment = {
  name: string;
  lsb: number;
  msb: number;
  access: Access;
  reset: string;
  description: string;
};
function segments(r: Register): Segment[] {
  if (!r.fields.length)
    return [
      {
        name: `reg_${r.name}`,
        lsb: 0,
        msb: r.width - 1,
        access: r.access,
        reset: r.reset,
        description: r.description,
      },
    ];
  const result: Segment[] = r.fields.map((f) => ({
    ...f,
    name: `field_${r.name}_${f.name}`,
  }));
  for (let bit = 0; bit < r.width; ) {
    if (r.fields.some((f) => bit >= f.lsb && bit <= f.msb)) {
      bit++;
      continue;
    }
    const low = bit++;
    while (bit < r.width && !r.fields.some((f) => bit >= f.lsb && bit <= f.msb))
      bit++;
    result.push({
      name: `gap_${r.name}_${low}_${bit - 1}`,
      lsb: low,
      msb: bit - 1,
      access: r.access,
      reset: ((unsigned(r.reset) >> BigInt(low)) & mask(bit - low)).toString(),
      description: "Unfielded bits inherit register access and reset",
    });
  }
  return result.sort((a, b) => a.lsb - b.lsb);
}
export function bankPorts(map: RegisterMap): Port[] {
  const ports: Port[] = [
    {
      name: "clk",
      direction: "input",
      width: 1,
      description: "Rising-edge clock",
    },
    {
      name: map.resetActiveLow ? "rst_n" : "rst",
      direction: "input",
      width: 1,
      description: `Synchronous active-${map.resetActiveLow ? "low" : "high"} reset`,
    },
    {
      name: "addr",
      direction: "input",
      width: map.addressWidth,
      description: "Byte address; full-word aligned",
    },
    {
      name: "wr_data",
      direction: "input",
      width: map.dataWidth,
      description: "Full-word write data; no byte strobes",
    },
    {
      name: "rd_data",
      direction: "output",
      width: map.dataWidth,
      description:
        "Combinational read data; zero when disabled/unmapped and for WO bits",
    },
    {
      name: "wr_en",
      direction: "input",
      width: 1,
      description: "Write on rising edge",
    },
    {
      name: "rd_en",
      direction: "input",
      width: 1,
      description: "Enable combinational read",
    },
  ];
  for (const r of map.registers) {
    ports.push({
      name: `reg_${r.name}_value_o`,
      direction: "output",
      width: r.width,
      description: `${r.name}: complete hardware value (including WO bits)`,
    });
    ports.push({
      name: `reg_${r.name}_write_o`,
      direction: "output",
      width: 1,
      description: `${r.name}: combinational accepted-write strobe; sample on clk`,
    });
    for (const s of segments(r)) {
      const width = s.msb - s.lsb + 1;
      if (s.access === "RO")
        ports.push({
          name: `${s.name}_i`,
          direction: "input",
          width,
          description:
            "Live hardware-driven RO value; reset is a software constant, hardware owns initialization",
        });
      else if (s.name.startsWith("field_"))
        ports.push({
          name: `${s.name}_value_o`,
          direction: "output",
          width,
          description: `${s.access} field value`,
        });
      if (s.access === "W1C")
        ports.push({
          name: `${s.name}_set_i`,
          direction: "input",
          width,
          description:
            "Hardware set bits; set wins over simultaneous software clear",
        });
    }
  }
  return ports;
}
const range = (width: number) => (width === 1 ? "" : `[${width - 1}:0] `);
function requireValid(map: RegisterMap) {
  const issues = validateMap(map);
  if (issues.length) throw new Error(issues.map((i) => i.message).join("\n"));
}
export function generateRtl(map: RegisterMap): string {
  requireValid(map);
  const ports = bankPorts(map);
  const lines = [
    "// Generated by Allora Register Builder V1. Regenerate in the builder.",
    "// Byte addresses; synchronous reset/writes, combinational reads. Hardware set wins W1C clear.",
    `module ${map.name} (`,
    ports
      .map((p) => `  ${p.direction} wire ${range(p.width)}${p.name}`)
      .join(",\n"),
    ");",
    "",
  ];
  for (const r of map.registers) {
    lines.push(`  // ${r.name} @ ${r.offset}: ${comment(r.description)}`);
    const address = hex(unsigned(r.offset), map.addressWidth);
    const writable = segments(r).some((s) => s.access !== "RO");
    lines.push(
      `  assign reg_${r.name}_write_o = ${writable ? `wr_en && ${map.resetActiveLow ? "rst_n" : "!rst"} && (addr == ${address})` : "1'b0"};`,
    );
    for (const s of segments(r)) {
      const width = s.msb - s.lsb + 1,
        value = s.access === "RO" ? `${s.name}_i` : `${s.name}_q`;
      const slice = `[${s.msb}:${s.lsb}]`;
      if (s.access !== "RO") {
        lines.push(
          `  reg ${range(width)}${s.name}_q;`,
          `  always @(posedge clk) begin`,
          `    if (${map.resetActiveLow ? "!rst_n" : "rst"}) ${value} <= ${hex(unsigned(s.reset), width)};`,
        );
        if (s.access === "W1C")
          lines.push(
            `    else ${value} <= (${value} & ~(reg_${r.name}_write_o ? wr_data${slice} : ${hex(0n, width)})) | ${s.name}_set_i;`,
          );
        else
          lines.push(
            `    else if (reg_${r.name}_write_o) ${value} <= wr_data${slice};`,
          );
        lines.push("  end");
        if (s.name.startsWith("field_"))
          lines.push(`  assign ${s.name}_value_o = ${value};`);
      }
      lines.push(`  assign reg_${r.name}_value_o${slice} = ${value};`);
    }
    lines.push("");
  }
  lines.push(
    `  reg [${map.dataWidth - 1}:0] read_value;`,
    "  assign rd_data = read_value;",
    "  always @* begin",
    `    read_value = ${hex(0n, map.dataWidth)};`,
    "    if (rd_en) begin",
    "      case (addr)",
  );
  for (const r of map.registers) {
    lines.push(`        ${hex(unsigned(r.offset), map.addressWidth)}: begin`);
    for (const s of segments(r))
      if (s.access !== "WO")
        lines.push(
          `          read_value[${s.msb}:${s.lsb}] = reg_${r.name}_value_o[${s.msb}:${s.lsb}];`,
        );
    lines.push("        end");
  }
  lines.push(
    "        default: ;",
    "      endcase",
    "    end",
    "  end",
    "endmodule",
    "",
  );
  return lines.join("\n");
}
export function effectiveReset(r: Register) {
  let value = unsigned(r.reset);
  for (const f of r.fields) {
    const m = mask(f.msb - f.lsb + 1) << BigInt(f.lsb);
    value = (value & ~m) | (unsigned(f.reset) << BigInt(f.lsb));
  }
  return value;
}
export function generateHeader(map: RegisterMap): string {
  requireValid(map);
  const prefix = `ALLORA_${map.name.toUpperCase()}`,
    constant = (n: bigint) => `UINT64_C(0x${n.toString(16)})`;
  const lines = [
    "/* Generated by Allora Register Builder V1. Offsets are bytes, relative to your base address. */",
    `#ifndef ${prefix}_H`,
    `#define ${prefix}_H`,
    "#include <stdint.h>",
    `#define ${prefix}_DATA_WIDTH ${map.dataWidth}u`,
    `#define ${prefix}_ADDRESS_WIDTH ${map.addressWidth}u`,
    "",
  ];
  for (const r of map.registers) {
    const p = `${prefix}_${r.name.toUpperCase()}`;
    lines.push(
      `/* ${comment(r.description)} (${r.access}; field modes override register mode) */`,
      `#define ${p}_OFFSET ${constant(unsigned(r.offset))}`,
      `#define ${p}_WIDTH ${r.width}u`,
      `#define ${p}_MASK ${constant(mask(r.width))}`,
      `#define ${p}_RESET ${constant(effectiveReset(r))}`,
    );
    for (const f of r.fields) {
      const fp = `${p}_${f.name.toUpperCase()}`;
      lines.push(
        `/* ${comment(f.description)} (${f.access}) */`,
        `#define ${fp}_SHIFT ${f.lsb}u`,
        `#define ${fp}_WIDTH ${f.msb - f.lsb + 1}u`,
        `#define ${fp}_MASK ${constant(mask(f.msb - f.lsb + 1) << BigInt(f.lsb))}`,
        `#define ${fp}_RESET ${constant(unsigned(f.reset))}`,
      );
    }
    lines.push("");
  }
  lines.push(`#endif /* ${prefix}_H */`, "");
  return lines.join("\n");
}
export function generateSnippet(map: RegisterMap): string {
  requireValid(map);
  const ports = bankPorts(map);
  return [
    "// Insert inside your design module. Connect each named wire to your design.",
    "// addr is a byte offset. No bus master or protocol bridge is generated.",
    ...ports.map(
      (p) => `wire ${range(p.width)}rb_${p.name}; // ${p.description}`,
    ),
    "",
    `${map.name} u_register_map (`,
    ports.map((p) => `  .${p.name}(rb_${p.name})`).join(",\n"),
    ");",
    "",
  ].join("\n");
}
export function validateIntegration(map: RegisterMap, i: Integration) {
  if (
    !i ||
    !validIdentifier(i.topModule) ||
    i.topModule === map.name ||
    i.topModule === `${map.name}_top` ||
    !Array.isArray(i.ports) ||
    !i.designInputs ||
    !i.bankInputs
  )
    throw new Error("Invalid integration configuration.");
  if (i.clock && i.clock === i.reset)
    throw new Error("Clock and reset must use distinct design inputs.");
  const names = new Set<string>();
  for (const p of i.ports) {
    if (
      !validIdentifier(p.name) ||
      p.name.startsWith("rb_") ||
      !["input", "output"].includes(p.direction) ||
      !integer(p.width, 1, 64) ||
      names.has(p.name)
    )
      throw new Error(
        "Assisted integration needs unique ordinary input/output ports up to 64 bits without the rb_ prefix. Use manual integration for this design.",
      );
    names.add(p.name);
  }
  for (const name of [i.clock, i.reset])
    if (
      name &&
      !i.ports.some(
        (p) => p.name === name && p.direction === "input" && p.width === 1,
      )
    )
      throw new Error(
        "Clock/reset must be scalar design inputs, or separate wrapper inputs.",
      );
  const bank = bankPorts(map);
  for (const [design, signal] of Object.entries(i.designInputs))
    if (
      !i.ports.some(
        (p) =>
          p.name === design &&
          p.direction === "input" &&
          p.name !== i.clock &&
          p.name !== i.reset &&
          bank.some(
            (b) =>
              b.name === signal &&
              b.direction === "output" &&
              b.name !== "rd_data" &&
              b.width === p.width,
          ),
      )
    )
      throw new Error(
        "Invalid design input connection; select a matching-width bank output.",
      );
  for (const [signal, design] of Object.entries(i.bankInputs))
    if (
      !bank.some(
        (b) =>
          b.name === signal &&
          b.direction === "input" &&
          ![
            "clk",
            "rst",
            "rst_n",
            "addr",
            "wr_data",
            "wr_en",
            "rd_en",
          ].includes(signal) &&
          i.ports.some(
            (p) =>
              p.name === design &&
              p.direction === "output" &&
              p.width === b.width,
          ),
      )
    )
      throw new Error(
        "Invalid bank input connection; select a matching-width design output.",
      );
}
export function generateWrapper(map: RegisterMap, i: Integration): string {
  requireValid(map);
  validateIntegration(map, i);
  const bank = bankPorts(map);
  const mapped = (p: Port) =>
    p.name === "clk"
      ? i.clock
      : ["rst", "rst_n"].includes(p.name)
        ? i.reset
        : i.bankInputs[p.name];
  const external = [
    ...i.ports.filter((p) => !i.designInputs[p.name]),
    ...bank
      .filter((p) => !mapped(p))
      .map((p) => ({ ...p, name: `rb_${p.name}` })),
  ];
  return [
    "// Generated integration wrapper. Original design files are preserved.",
    "// Clock/reset connections and hardware mappings were explicitly selected in Register Builder.",
    "// Exposed rb_* inputs require a bus master / hardware source; map physical pins or virtual inputs.",
    `module ${map.name}_top (`,
    external
      .map((p) => `  ${p.direction} wire ${range(p.width)}${p.name}`)
      .join(",\n"),
    ");",
    "",
    `  ${i.topModule} u_design (`,
    i.ports
      .map(
        (p) =>
          `    .${p.name}(${i.designInputs[p.name] ? `rb_${i.designInputs[p.name]}` : p.name})`,
      )
      .join(",\n"),
    "  );",
    "",
    `  ${map.name} u_register_map (`,
    bank
      .map((p) => `    .${p.name}(${mapped(p) || `rb_${p.name}`})`)
      .join(",\n"),
    "  );",
    "endmodule",
    "",
  ].join("\n");
}
export function generateFiles(
  map: RegisterMap,
  integration?: Integration,
): Record<string, string> {
  const base = `Register_Map/${map.name}`;
  const files = {
    [`${base}.sv`]: generateRtl(map),
    [`${base}.h`]: generateHeader(map),
    [`${base}.json`]:
      JSON.stringify({ schemaVersion: 1, ...map }, null, 2) + "\n",
    [`${base}_instantiation.txt`]: generateSnippet(map),
  };
  if (integration) files[`${base}_top.sv`] = generateWrapper(map, integration);
  return files;
}
