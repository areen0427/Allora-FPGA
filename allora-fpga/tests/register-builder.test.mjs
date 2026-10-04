import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import {
  emptyMap,
  validateMap,
  generateFiles,
  generateRtl,
  generateHeader,
  generateWrapper,
  generateSnippet,
  parseManifest,
  serializeManifest,
  generationKey,
  bankPorts,
  effectiveReset,
} from "../src/lib/registerBuilder.ts";
import { findTopModuleFile } from "../src/hooks/utils.ts";
import { RegisterProjectStore } from "../src/lib/registerBuilderProject.ts";
const reg = (name, offset, access = "RW", reset = "0", width = 32) => ({
  id: name,
  name,
  offset,
  width,
  access,
  reset,
  description: `${name} register`,
  fields: [],
});
const field = (name, lsb, msb, access = "RW", reset = "0") => ({
  id: name,
  name,
  lsb,
  msb,
  access,
  reset,
  description: `${name} field`,
});
const example = () => ({
  ...emptyMap(),
  name: "control_bank",
  registers: [
    reg("CONTROL", "0x00", "RW", "0x12"),
    reg("STATUS", "0x04", "RO"),
    reg("COMMAND", "0x08", "WO"),
    reg("FLAGS", "0x0c", "W1C", "3"),
    {
      ...reg("MIXED", "0x10", "RW", "0x80000000"),
      fields: [
        field("ENABLE", 0, 0, "RW", "1"),
        field("READY", 1, 1, "RO"),
        field("PULSE", 2, 2, "WO"),
        field("FAULT", 3, 3, "W1C", "1"),
      ],
    },
  ],
});
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 60000 });
  assert.equal(
    r.status,
    0,
    `${cmd}: ${r.error ?? ""}\n${r.stdout}\n${r.stderr}`,
  );
  return r;
}
function temp(action) {
  const root = mkdtempSync(join(tmpdir(), "allora-register-"));
  try {
    return action(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("representative map, port exposure, effective field reset and deterministic generation", () => {
  const map = example();
  assert.deepEqual(validateMap(map), []);
  assert.equal(effectiveReset(map.registers[4]), 0x80000009n);
  assert.deepEqual(generateFiles(map), generateFiles(structuredClone(map)));
  assert.match(generateSnippet(map), /\.reg_STATUS_i\(rb_reg_STATUS_i\)/);
  assert.ok(
    bankPorts(map).some(
      (p) => p.name === "field_MIXED_FAULT_set_i" && p.direction === "input",
    ),
  );
});
test("duplicate addresses, misalignment, partial address overlaps and address overflow", () => {
  const map = example();
  map.registers[1].offset = "0";
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /duplicate address/,
  );
  map.registers[1].offset = "2";
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /address overlap/,
  );
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /aligned/,
  );
  map.registers[1].offset = "65536";
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /address space/,
  );
  map.registers[1].offset = "-1";
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /invalid address/,
  );
});
test("field overlap, outside width, inverted/fractional ranges and duplicate names", () => {
  for (const [fields, message] of [
    [[field("A", 0, 3), field("B", 3, 5)], /overlapping/],
    [[field("A", 31, 32)], /outside/],
    [[field("A", 3, 2)], /invalid bit range/],
    [[field("A", 0.5, 2)], /invalid bit range/],
    [[field("A", 0, 0), field("a", 1, 1)], /duplicate field name/],
  ]) {
    const map = {
      ...emptyMap(),
      registers: [{ ...reg("CONTROL", "0"), fields }],
    };
    assert.match(
      validateMap(map)
        .map((i) => i.message)
        .join("\n"),
      message,
    );
    assert.throws(() => generateRtl(map));
  }
});
test("identifier, width, access, IDs and exact 64-bit reset validation", () => {
  const map = {
    ...emptyMap(),
    dataWidth: 64,
    registers: [reg("WIDE", "0", "RW", "0xffffffffffffffff", 64)],
  };
  assert.deepEqual(validateMap(map), []);
  map.registers[0].reset = "18446744073709551616";
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /reset exceeds/,
  );
  map.registers[0].reset = "0";
  map.registers[0].fields = [field("TOO_BIG", 0, 0, "RW", "2")];
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /reset exceeds/,
  );
  for (const name of [
    "module",
    "bad name",
    "1abc",
    "a;endmodule",
    "timeunit",
    "type",
    "clocking",
    "with",
    "covergroup",
    "tb_registers",
    "bank_tb",
  ]) {
    map.name = name;
    assert.throws(() => generateRtl(map));
  }
  map.name = "bank";
  map.registers[0].width = 65;
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /width must/,
  );
  map.registers[0].access = "BAD";
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /invalid access/,
  );
});
test("generated signal and flattened C constant collisions are rejected", () => {
  const map = {
    ...emptyMap(),
    registers: [
      { ...reg("A", "0"), fields: [field("B_C", 0, 0)] },
      { ...reg("A_B", "4"), fields: [field("C", 0, 0)] },
    ],
  };
  assert.match(
    validateMap(map)
      .map((i) => i.message)
      .join("\n"),
    /C constant/,
  );
  assert.throws(() => generateHeader(map));
  map.registers[1].fields = [];
  assert.deepEqual(validateMap(map), []);
});
test("manifest round-trip retains invalid drafts, configuration and ownership, rejects malformed structure", () => {
  const m = {
    schemaVersion: 1,
    map: example(),
    outputs: [{ path: "Register_Map/control_bank.sv", hash: "a".repeat(64) }],
    generatedKey: "key",
  };
  m.map.registers[0].name = "invalid name";
  assert.deepEqual(parseManifest(serializeManifest(m)), m);
  for (const patch of [
    { schemaVersion: 2 },
    { outputs: [{ path: "../top.sv", hash: "a".repeat(64) }] },
    { map: { ...m.map, registers: [null] } },
    { integration: { topModule: "top" } },
  ])
    assert.throws(() => parseManifest(JSON.stringify({ ...m, ...patch })));
});
function service() {
  const disk = new Map();
  const encode = new TextEncoder();
  let fail = false;
  return {
    disk,
    encode,
    fail: () => {
      fail = true;
    },
    read: async (p) => disk.get(p)?.slice() ?? null,
    commit: async (changes) => {
      if (fail) {
        fail = false;
        throw new Error("disk full");
      }
      for (const c of changes)
        assert.deepEqual(
          c.expected,
          disk.get(c.path) ?? null,
          `conflict: ${c.path}`,
        );
      for (const c of changes)
        if (c.content === null) disk.delete(c.path);
        else disk.set(c.path, c.content.slice());
    },
  };
}
test("draft save, durable reopen, deterministic regeneration and generated relationships", async () => {
  const fs = service(),
    store = new RegisterProjectStore(fs, "/project");
  await store.load();
  const map = example();
  await store.saveMap(map);
  const result = await store.generate(map);
  assert.equal(result.files.length, 5);
  const before = new Map(fs.disk);
  const reopened = new RegisterProjectStore(fs, "/project");
  assert.deepEqual((await reopened.load()).map, map);
  await reopened.generate(map);
  assert.deepEqual(fs.disk, before);
  assert.equal(reopened.manifest.generatedKey, generationKey(map));
  const draft = structuredClone(map);
  draft.registers[0].offset = "not valid";
  await reopened.saveMap(draft);
  assert.deepEqual(
    (await new RegisterProjectStore(fs, "/project").load()).map,
    draft,
  );
});
test("unowned, externally edited outputs and stale manifests cannot be overwritten", async () => {
  for (const conflict of ["unowned", "edited", "manifest"]) {
    const fs = service(),
      store = new RegisterProjectStore(fs, "/project");
    await store.load();
    const map = example();
    if (conflict === "unowned")
      fs.disk.set(
        "Register_Map/control_bank.sv",
        fs.encode.encode("handwritten"),
      );
    else await store.generate(map);
    if (conflict === "edited")
      fs.disk.set(
        "Register_Map/control_bank.sv",
        fs.encode.encode("handwritten"),
      );
    if (conflict === "manifest")
      fs.disk.set(
        "Register_Map/register-builder.json",
        fs.encode.encode("external manifest"),
      );
    const before = new Map(fs.disk);
    await assert.rejects(() => store.generate(map));
    assert.deepEqual(fs.disk, before);
  }
});
test("failed transaction preserves ownership; queued rapid edits save in order; rename removes only owned outputs", async () => {
  const fs = service(),
    store = new RegisterProjectStore(fs, "/project");
  await store.load();
  const map = example();
  fs.fail();
  await assert.rejects(() => store.generate(map), /disk full/);
  assert.equal(store.manifest.outputs.length, 0);
  const maps = [1, 2, 3].map((n) => ({ ...map, addressWidth: 16 + n }));
  await Promise.all(maps.map((m) => store.saveMap(m)));
  assert.equal(store.manifest.map.addressWidth, 19);
  await store.generate(map);
  fs.disk.set(
    "Register_Map/handwritten.sv",
    fs.encode.encode("module handwritten; endmodule"),
  );
  const result = await store.generate({ ...map, name: "renamed" });
  assert.ok(result.removed.includes("Register_Map/control_bank.sv"));
  assert.ok(fs.disk.has("Register_Map/handwritten.sv"));
});
const connection = () => ({
  topModule: "user_design",
  clock: "clock",
  reset: "reset",
  ports: [
    { name: "clock", direction: "input", width: 1 },
    { name: "reset", direction: "input", width: 1 },
    { name: "enable", direction: "input", width: 1 },
    { name: "ready", direction: "output", width: 1 },
  ],
  designInputs: { enable: "field_MIXED_ENABLE_value_o" },
  bankInputs: { field_MIXED_READY_i: "ready" },
});
test("wrapper connections, reset polarity, invalid mappings, and persistence", async () => {
  const map = example(),
    i = connection();
  const wrapper = generateWrapper(map, i);
  assert.match(wrapper, /\.enable\(rb_field_MIXED_ENABLE_value_o\)/);
  assert.match(wrapper, /\.field_MIXED_READY_i\(ready\)/);
  assert.doesNotMatch(wrapper, /input wire enable/);
  assert.match(wrapper, /input wire \[15:0\] rb_addr/);
  assert.throws(() => generateWrapper(map, { ...i, reset: "clock" }));
  assert.throws(() =>
    generateWrapper(map, {
      ...i,
      designInputs: { enable: "reg_CONTROL_value_o" },
    }),
  );
  assert.throws(() =>
    generateWrapper(map, {
      ...i,
      ports: [{ name: "bad", direction: "inout", width: 1 }],
    }),
  );
  const fs = service(),
    store = new RegisterProjectStore(fs, "/project");
  await store.load();
  await store.generate(map, i);
  const reopened = await new RegisterProjectStore(fs, "/project").load();
  assert.deepEqual(reopened.integration, i);
});
test("real Icarus simulation verifies RW RO WO W1C, fields/gaps, read gating, reset priority and both polarities", () =>
  temp((root) => {
    for (const activeLow of [false, true]) {
      const map = { ...example(), resetActiveLow: activeLow };
      writeFileSync(join(root, "bank.sv"), generateRtl(map));
      const resetName = activeLow ? "rst_n" : "rst",
        asserted = activeLow ? 0 : 1,
        released = activeLow ? 1 : 0;
      writeFileSync(
        join(root, "tb.sv"),
        `module tb;
reg clk=0, reset=${asserted}, wr_en=0, rd_en=1; reg [15:0] addr=0; reg [31:0] wr_data=0; wire [31:0] rd_data;
reg [31:0] status=32'h87654321, flags_set=0; reg ready=1, fault_set=0;
wire [31:0] command, flags, mixed; wire pulse, enable;
control_bank dut(.clk(clk),.${resetName}(reset),.addr(addr),.wr_data(wr_data),.rd_data(rd_data),.wr_en(wr_en),.rd_en(rd_en),.reg_STATUS_i(status),.reg_FLAGS_set_i(flags_set),.field_MIXED_READY_i(ready),.field_MIXED_FAULT_set_i(fault_set),.reg_COMMAND_value_o(command),.reg_FLAGS_value_o(flags),.reg_MIXED_value_o(mixed),.field_MIXED_PULSE_value_o(pulse),.field_MIXED_ENABLE_value_o(enable));
task tick; begin #2;clk=1;#2;clk=0;#2;end endtask
task check; input [31:0] expected; begin #1; if(rd_data !== expected) $fatal(1,"read addr %h expected %h got %h",addr,expected,rd_data); end endtask
initial begin tick; check(32'h12); addr=16;check(32'h8000000b);reset=${released};
addr=0;wr_data=32'h12345678;wr_en=1;tick;wr_en=0;check(32'h12345678);
addr=4;wr_data=0;wr_en=1;tick;wr_en=0;check(32'h87654321);status=32'h9;check(32'h9);
addr=8;wr_data=32'hdeadbeef;wr_en=1;tick;wr_en=0;check(0);if(command !== 32'hdeadbeef) $fatal(1,"WO consumer");
addr=12;check(3);wr_data=1;wr_en=1;tick;wr_en=0;check(2);flags_set=4;tick;flags_set=0;check(6);wr_en=1;wr_data=6;flags_set=2;tick;wr_en=0;flags_set=0;check(2);
addr=16;wr_data=32'h24;wr_en=1;tick;wr_en=0;check(32'h2a);if(!pulse || enable || mixed !== 32'h2e) $fatal(1,"mixed WO or gap semantics");fault_set=1;tick;fault_set=0;check(32'h2a);wr_data=8;wr_en=1;fault_set=1;tick;wr_en=0;fault_set=0;check(10);
rd_en=0;check(0);rd_en=1;addr=16'hffff;check(0);
reset=${asserted};wr_en=1;wr_data=32'hffffffff;addr=0;tick;wr_en=0;check(32'h12);addr=12;check(3);addr=16;check(32'h8000000b);
$display("REGISTER_BEHAVIOR_PASS");$finish;end endmodule`,
      );
      run(
        "iverilog",
        ["-g2012", "-s", "tb", "-o", "out", "bank.sv", "tb.sv"],
        root,
      );
      assert.match(run("vvp", ["out"], root).stdout, /REGISTER_BEHAVIOR_PASS/);
    }
  }));
test("all data widths compile; C constants are correct; real Yosys synthesis and Verilator wrapper lint", () =>
  temp((root) => {
    const map = example(),
      i = connection();
    const files = generateFiles(map, i);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    writeFileSync(
      join(root, "design.sv"),
      "module user_design(input wire clock, reset, enable, output wire ready); reg state; always @(posedge clock) if(reset) state<=0; else state<=enable; assign ready=state; endmodule",
    );
    run(
      "iverilog",
      [
        "-g2012",
        "-s",
        "control_bank_top",
        "-o",
        "out",
        "design.sv",
        "Register_Map/control_bank.sv",
        "Register_Map/control_bank_top.sv",
      ],
      root,
    );
    run(
      "yosys",
      [
        "-Q",
        "-T",
        "-p",
        "read_verilog -sv design.sv Register_Map/control_bank.sv Register_Map/control_bank_top.sv; hierarchy -check -top control_bank_top; synth -top control_bank_top; check -assert",
      ],
      root,
    );
    run(
      "verilator",
      [
        "--lint-only",
        "-Wno-fatal",
        "--top-module",
        "control_bank_top",
        "design.sv",
        "Register_Map/control_bank.sv",
        "Register_Map/control_bank_top.sv",
      ],
      root,
    );
    writeFileSync(
      join(root, "header.c"),
      '#include "Register_Map/control_bank.h"\n_Static_assert(ALLORA_CONTROL_BANK_MIXED_FAULT_MASK == 8, "mask");\n_Static_assert(ALLORA_CONTROL_BANK_MIXED_FAULT_SHIFT == 3, "shift");\n_Static_assert(ALLORA_CONTROL_BANK_MIXED_RESET == 0x80000009, "reset");\n_Static_assert(ALLORA_CONTROL_BANK_STATUS_OFFSET == 4, "offset");\n',
    );
    run("cc", ["-std=c11", "-Wall", "-Werror", "-c", "header.c"], root);
    for (const dataWidth of [8, 16, 32, 64]) {
      const m = {
        ...emptyMap(),
        dataWidth,
        registers: [
          reg(
            "CONTROL",
            "0",
            "RW",
            String((1n << BigInt(dataWidth)) - 1n),
            dataWidth,
          ),
        ],
      };
      writeFileSync(join(root, "wide.sv"), generateRtl(m));
      run(
        "iverilog",
        ["-g2012", "-s", "register_map", "-o", "wide", "wide.sv"],
        root,
      );
    }
  }));

test("project top resolution honors nested generated sources and exact module declarations", () => {
  const files = [
    {
      name: "Register_Map/bank.sv",
      content: "// module bank_top misleading comment\nmodule bank; endmodule",
    },
    { name: "Register_Map/bank_top.sv", content: "module bank_top; endmodule" },
  ];
  assert.equal(
    findTopModuleFile(files, "bank_top"),
    "Register_Map/bank_top.sv",
  );
  assert.equal(findTopModuleFile(files, "bank"), "Register_Map/bank.sv");
  assert.equal(findTopModuleFile(files, "missing"), null);
});

test("missing owned outputs are safely recreated with an absent-file expectation", async () => {
  const fs = service(),
    store = new RegisterProjectStore(fs, "/project");
  await store.load();
  await store.generate(example());
  fs.disk.delete("Register_Map/control_bank.sv");
  await store.generate(example());
  assert.match(
    new TextDecoder().decode(fs.disk.get("Register_Map/control_bank.sv")),
    /module control_bank/,
  );
});
