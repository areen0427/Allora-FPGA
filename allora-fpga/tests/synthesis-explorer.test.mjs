import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import ELK from "elkjs/lib/elk.bundled.js";
const load = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
};
const {
  buildHardwareGraph,
  traceGraph,
  graphIndex,
  projectGraph,
  legacyGraph,
  sourceMatches,
  sourceAssociations,
  sourceLocations,
  sourceFile,
  reconcileSelection,
  stageStats,
  recordedValue,
  waveformCandidates,
  category,
  parameterNumber,
  logicDepth,
  waveformScopes,
  connectionValue,
} = await load("../src/lib/synthesisGraph.ts");
const { createElkLayout, classifySymbol } = await load(
  "../src/lib/synthesisLayout.ts",
);
const { parseVcd } = await load("../src/lib/vcd.ts");
const cell = (type, connections, dirs, src = "src/top.sv:2.1-3.12") => ({
  type,
  connections,
  port_directions: dirs,
  attributes: { src },
  parameters: {},
});
const fixture = {
  modules: {
    top: {
      ports: {
        a: { direction: "input", bits: [2, 3] },
        clk: { direction: "input", bits: [4] },
        q: { direction: "output", bits: [8, 9] },
        pad: { direction: "inout", bits: [20] },
      },
      netnames: {
        a: {
          bits: [2, 3],
          offset: 4,
          attributes: { src: "src/top.sv:1.1-1.50" },
        },
        sum: { bits: [6, 7] },
        q: { bits: [8, 9] },
        feedback: { bits: [10] },
        constants: { bits: ["0", "0", "x", "z"] },
      },
      cells: {
        add: cell(
          "$add",
          { A: [2, 3], B: ["0", "0"], Y: [6, 7] },
          { A: "input", B: "input", Y: "output" },
        ),
        reg: cell(
          "$dff",
          { D: [6, 7], Q: [8, 9], CLK: [4] },
          { D: "input", Q: "output", CLK: "input" },
        ),
        after: cell("$not", { A: [8], Y: [10] }, { A: "input", Y: "output" }),
        feedback: cell(
          "$not",
          { A: [10], Y: [10] },
          { A: "input", Y: "output" },
        ),
        child: cell("child", { I: [9], O: [11] }, { I: "input", O: "output" }),
      },
    },
    child: {
      ports: {
        I: { direction: "input", bits: [1] },
        O: { direction: "output", bits: [2] },
      },
      cells: {
        inv: cell(
          "$not",
          { A: [1], Y: [2] },
          { A: "input", Y: "output" },
          "src/child.sv:3.1-3.10",
        ),
      },
    },
  },
};
const graph = buildHardwareGraph(fixture, "top");

test("pins, repeated constant lanes, bus widths and bit identity survive normalization", () => {
  const input = graph.edges.find(
    (edge) => edge.from === "port:a" && edge.toPort === "A",
  );
  assert.equal(input.width, 2);
  assert.deepEqual(input.bits, [2, 3]);
  assert.deepEqual(input.connections, [
    { bit: 2, fromIndex: 0, toIndex: 0 },
    { bit: 3, fromIndex: 1, toIndex: 1 },
  ]);
  const zero = graph.edges.find((edge) => edge.from === "const:0");
  assert.equal(zero.width, 2);
  assert.deepEqual(zero.bits, ["0"]);
  assert.equal(zero.connections.length, 2);
  assert.equal(
    graph.nodes.find((node) => node.id === "port:pad").kind,
    "inout",
  );
  assert.ok(
    !graph.edges.some(
      (edge) => edge.from === edge.to && edge.from === "port:pad",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) => edge.from === edge.to && edge.from === "cell:feedback",
    ),
  );
  assert.equal(graph.edges.find((edge) => edge.toPort === "CLK").role, "clock");
  assert.equal(graph.nets.find((net) => net.name === "a").offset, 4);
  assert.equal(
    graph.nodes.filter((node) => node.kind === "constant").length,
    1,
  );
});
test("different destination pins sharing bits remain different connections", () => {
  const result = buildHardwareGraph(
    {
      modules: {
        top: {
          ports: { a: { direction: "input", bits: [2] } },
          cells: {
            gate: cell(
              "$and",
              { A: [2], B: [2], Y: [3] },
              { A: "input", B: "input", Y: "output" },
            ),
          },
        },
      },
    },
    "top",
  );
  assert.equal(result.edges.filter((edge) => edge.from === "port:a").length, 2);
});
test("hierarchy references real modules; resource libraries remain primitives", () => {
  assert.equal(
    graph.nodes.find((node) => node.id === "cell:child").module,
    "child",
  );
  const child = buildHardwareGraph(fixture, "child");
  assert.equal(child.nodes.length, 3);
  const primitive = buildHardwareGraph(
    {
      modules: {
        top: { cells: { lut: cell("SB_LUT4", { O: [1] }, { O: "output" }) } },
        SB_LUT4: { attributes: { blackbox: "1" } },
      },
    },
    "top",
  ).nodes[0];
  assert.equal(primitive.category, "lut");
  assert.equal(primitive.module, undefined);
  assert.throws(() => buildHardwareGraph(fixture, "missing"), /absent/);
});
test("forward/backward tracing stops at storage and terminates feedback cycles", () => {
  const forward = traceGraph(graph, "port:a", "forward");
  assert.ok(forward.nodes.has("cell:reg"));
  assert.ok(forward.boundaries.has("cell:reg"));
  assert.ok(!forward.nodes.has("cell:after"));
  const through = traceGraph(graph, "port:a", "forward", false);
  assert.ok(through.nodes.has("cell:feedback"));
  assert.ok(through.edges.size <= graph.edges.length);
  const backward = traceGraph(graph, "cell:after", "backward");
  assert.ok(backward.nodes.has("cell:reg"));
  assert.ok(!backward.nodes.has("cell:add"));
  const clock = traceGraph(graph, "port:clk", "forward");
  assert.deepEqual([...clock.boundaries], ["cell:reg"]);
  const signal = traceGraph(graph, "net:a", "forward", true, 2);
  assert.ok(
    signal.edges.has(graph.edges.find((edge) => edge.from === "port:a").id),
  );
});
test("selected bit filters the initial signal connections", () => {
  const result = buildHardwareGraph(
    {
      modules: {
        top: {
          ports: { a: { direction: "input", bits: [2, 3] } },
          netnames: { a: { bits: [2, 3] } },
          cells: {
            low: cell("$not", { A: [2], Y: [4] }, { A: "input", Y: "output" }),
            high: cell("$not", { A: [3], Y: [5] }, { A: "input", Y: "output" }),
          },
        },
      },
    },
    "top",
  );
  const trace = traceGraph(result, "net:a", "forward", true, 2);
  assert.ok(trace.nodes.has("cell:low"));
  assert.ok(!trace.nodes.has("cell:high"));
});
test("source spans include merged origins and only resolve exact workspace paths", () => {
  assert.equal(
    sourceLocations("src/top.sv:2.1-3.12|src/child.sv:4.1-5.2").length,
    2,
  );
  assert.deepEqual(sourceLocations("unknown"), []);
  assert.equal(
    sourceFile({ file: "src/src/top.sv" }, [
      { name: "src/top.sv", content: "RTL" },
    ]).name,
    "src/top.sv",
  );
  assert.equal(
    sourceFile({ file: "external/top.sv" }, [
      { name: "src/top.sv", content: "RTL" },
    ]),
    undefined,
  );
  assert.ok(
    sourceMatches(
      graph,
      [{ name: "top.sv", content: "RTL" }],
      "top.sv",
      2,
      2,
    ).includes("cell:add"),
  );
  assert.deepEqual(sourceMatches(graph, [], "top.sv", 2, 2), []);
});
test("category summaries preserve membership and do not claim bus widths", () => {
  const collapsed = projectGraph(graph, new Set(["logic", "arithmetic"]));
  const group = collapsed.nodes.find((node) => node.id === "group:logic");
  assert.deepEqual(group.members, ["cell:after", "cell:feedback"]);
  assert.ok(collapsed.edges.some((edge) => edge.members?.length));
  assert.ok(
    collapsed.edges
      .filter((edge) => edge.members)
      .every((edge) => edge.width === 0),
  );
  assert.equal(projectGraph(graph, new Set()).edges.length, graph.edges.length);
  assert.equal(graph.nodes.length, 10);
});
test("selection follows stable identity or an unambiguous source span; absent mappings clear", () => {
  assert.equal(reconcileSelection(graph, graph, "cell:add"), "cell:add");
  const next = structuredClone(graph);
  next.nodes = [
    { ...graph.nodes.find((node) => node.id === "cell:add"), id: "cell:new" },
  ];
  assert.equal(reconcileSelection(graph, next, "cell:add"), "cell:new");
  next.nodes.push({ ...next.nodes[0], id: "cell:other" });
  assert.equal(reconcileSelection(graph, next, "cell:add"), null);
  assert.equal(reconcileSelection(graph, graph, "missing"), null);
});
test("missing directions and legacy artifacts never infer bit widths or source mapping", () => {
  const result = buildHardwareGraph(
    {
      modules: {
        top: {
          cells: {
            unknown: { type: "unknown", connections: { A: [1], B: [2] } },
          },
        },
      },
    },
    "top",
  );
  assert.equal(result.edges.length, 0);
  assert.match(result.warnings[0], /missing pin direction/);
  const legacy = legacyGraph({
    topModule: "top",
    nodes: [{ id: "a", label: "a", kind: "cell", detail: "$and" }],
    edges: [{ from: "a", to: "a", label: "signal" }],
  });
  assert.equal(legacy.edges[0].width, 0);
  assert.deepEqual(legacy.nodes[0].sources, []);
  assert.match(legacy.warnings[0], /Legacy/);
});
test("large graphs are bounded only in projection; analysis and indexes remain complete", () => {
  const large = {
    ...graph,
    nodes: Array.from({ length: 12000 }, (_, i) => ({
      ...graph.nodes[0],
      id: `n${i}`,
    })),
    edges: [],
  };
  large.edges = large.nodes.slice(1).map((node) => ({
    ...graph.edges[0],
    id: node.id,
    from: "n0",
    to: node.id,
  }));
  const index = graphIndex(large);
  assert.equal(index.outgoing.get("n0").length, 11999);
  const limited = projectGraph(large, new Set(), 100, "n11999");
  assert.equal(limited.nodes.length, 100);
  assert.equal(limited.nodes[0].id, "n11999");
  assert.match(limited.warnings.at(-1), /omitted connections/);
  assert.equal(traceGraph(large, "n0", "forward").nodes.size, 12000);
});
test("recorded values require an explicit exact scope and preserve unknown/high impedance", () => {
  const values = [
    { time: 4, value: "xz" },
    { time: 10, value: "01" },
  ];
  assert.equal(recordedValue(values, 0), null);
  assert.equal(recordedValue(values, 7), "xz");
  assert.equal(recordedValue(values, 10), "01");
  const net = graph.nets[0],
    signals = [
      { id: "1", name: "tb.dut.a [5:4]", width: 2 },
      { id: "2", name: "other.a", width: 2 },
    ];
  assert.equal(waveformCandidates(net, signals, "").length, 0);
  assert.equal(waveformCandidates(net, signals, "tb.dut").length, 1);
  assert.equal(waveformCandidates(net, signals, "dut").length, 0);
  assert.equal(
    waveformCandidates(net, [...signals, signals[0]], "tb.dut").length,
    2,
  );
});
test("VCD explorer parsing preserves scoped aliases without synthetic values", () => {
  const wave = parseVcd(
    "$scope module tb $end\n$scope module dut $end\n$var wire 2 ! a [1:0] $end\n$var wire 2 ! alias [1:0] $end\n$var wire 1 ? missing $end\n$upscope $end\n$upscope $end\n$enddefinitions $end\n#4\nbxz !\n#10\nb01 !",
    { preserveAliases: true, initialUnknown: false },
  );
  assert.equal(wave.signals.length, 3);
  assert.deepEqual(wave.signals[0].values, wave.signals[1].values);
  assert.deepEqual(wave.signals[2].values, []);
  assert.equal(recordedValue(wave.signals[0].values, 0), null);
  assert.equal(recordedValue(wave.signals[1].values, 4), "xz");
});
test("symbol classification uses cell type, not misleading instance names", () => {
  assert.equal(classifySymbol("result_add_not", "$mux", "cell").shape, "mux");
  assert.equal(classifySymbol("mem_name", "$dff", "cell").shape, "register");
  assert.equal(classifySymbol("anything", "$le", "cell").mark, "≤");
  assert.equal(category("$mem_v2"), "memory");
  assert.equal(category("$fsm"), "fsm");
});
test("production ELK layout attaches actual pin endpoints and handles feedback", async () => {
  const layout = await createElkLayout(graph, new ELK());
  assert.equal(layout.nodes.length, graph.nodes.length);
  assert.equal(layout.edges.length, graph.edges.length);
  assert.ok(
    layout.nodes.every(
      (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
    ),
  );
  assert.ok(
    layout.edges.every(
      (edge) => edge.path.startsWith("M") && Number.isFinite(edge.bounds.x),
    ),
  );
  const add = layout.nodes.find((node) => node.id === "cell:add");
  assert.deepEqual(
    new Set(add.layoutPins.map((pin) => pin.name)),
    new Set(["A", "B", "Y"]),
  );
  assert.ok(
    layout.edges.every((edge) =>
      graph.edges.some((source) => source.id === edge.id),
    ),
  );
});
test("real Yosys hierarchical functional, logic, memory and FPGA artifacts normalize", async () => {
  const temp = await mkdtemp(
    new URL(".synthesis-test-", new URL("../", import.meta.url)).pathname,
  );
  try {
    const fixturePath = new URL(
      "fixtures/synthesis-explorer.sv",
      import.meta.url,
    ).pathname;
    const script = `read_verilog -sv ${fixturePath}; hierarchy -top explorer_top; proc; memory_collect; write_json ${temp}/functional.json; opt; fsm; opt; memory; opt; write_json ${temp}/logic.json; synth_ice40 -top explorer_top; write_json ${temp}/technology.json`;
    const result = spawnSync("yosys", ["-Q", "-q", "-p", script], {
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    const stages = {};
    for (const name of ["functional", "logic", "technology"]) {
      stages[name] = JSON.parse(await readFile(`${temp}/${name}.json`, "utf8"));
      for (const module of [
        "explorer_top",
        ...(stages[name].modules.lane ? ["lane"] : []),
      ]) {
        const normalized = buildHardwareGraph(stages[name], module);
        assert.ok(normalized.nodes.length);
        assert.ok(
          normalized.edges.every(
            (edge) =>
              normalized.nodes.some((node) => node.id === edge.from) &&
              normalized.nodes.some((node) => node.id === edge.to),
          ),
        );
      }
    }
    assert.ok(
      buildHardwareGraph(stages.functional, "explorer_top").nodes.some(
        (node) => node.category === "memory",
      ),
    );
    assert.ok(
      buildHardwareGraph(stages.functional, "explorer_top").nodes.some(
        (node) => node.module === "lane",
      ),
    );
    assert.ok(
      buildHardwareGraph(stages.technology, "explorer_top").nodes.some(
        (node) => node.category === "lut",
      ),
    );
    assert.ok(stageStats(stages.functional, "explorer_top").instances > 0);
    const mapped = buildHardwareGraph(stages.technology, "explorer_top");
    const layout = await createElkLayout(
      projectGraph(mapped, new Set()),
      new ELK(),
    );
    assert.equal(layout.nodes.length, mapped.nodes.length);
    assert.ok(layout.edges.length);
    assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

// These are protocol/unit checks in Node, never browser or application launches.
const moduleUrl = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
};
const tauriUrl = await moduleUrl("../src/lib/tauri.ts");
const bridgedModule = async (path) => {
  const url = await moduleUrl(path);
  const code = Buffer.from(url.split(",")[1], "base64")
    .toString()
    .replaceAll('"./tauri"', JSON.stringify(tauriUrl));
  return import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
};
const { publishExplorer, listenExplorer } = await bridgedModule(
  "../src/lib/explorerBridge.ts",
);
const { openViewerWindow } = await bridgedModule("../src/lib/viewerWindow.ts");

test("native event cleanup handles disposal before registration and suppresses late events", async () => {
  const previous = globalThis.window;
  let resolve,
    receiver,
    cleaned = 0;
  const emitted = [],
    received = [];
  globalThis.window = {
    __TAURI__: {
      core: { invoke() {} },
      event: {
        listen(_name, callback) {
          receiver = callback;
          return new Promise((done) => {
            resolve = done;
          });
        },
        async emit(name, payload) {
          emitted.push({ name, payload });
        },
      },
    },
  };
  try {
    const dispose = listenExplorer((message) => received.push(message));
    dispose();
    resolve(() => cleaned++);
    await Promise.resolve();
    receiver({ payload: { type: "waveform-request", projectKey: "project" } });
    assert.equal(cleaned, 1);
    assert.deepEqual(received, []);
    const message = {
      type: "rtl-selection",
      projectKey: "project",
      fileName: "top.sv",
      content: "module top; endmodule",
      start: 1,
      end: 1,
    };
    await publishExplorer(message);
    assert.deepEqual(emitted, [
      { name: "allora-synthesis-explorer", payload: message },
    ]);
  } finally {
    globalThis.window = previous;
  }
});
test("browser fallback exchanges project-scoped messages without opening a browser", async () => {
  const previous = globalThis.window;
  globalThis.window = {};
  let dispose;
  try {
    const message = {
      type: "waveform-time",
      projectKey: "project",
      recordingId: "recorded-run",
      time: 20,
    };
    const received = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("BroadcastChannel delivery timed out")),
        1000,
      );
      dispose = listenExplorer((message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
    await publishExplorer(message);
    assert.deepEqual(await received, message);
  } finally {
    dispose?.();
    globalThis.window = previous;
  }
});
test("native synthesis continues using the separate viewer-window command and payload", async () => {
  const previous = globalThis.window;
  let request;
  globalThis.window = {
    crypto: { randomUUID: () => "test-viewer" },
    __TAURI__: {
      core: {
        async invoke(command, args) {
          request = { command, args };
        },
      },
    },
  };
  try {
    const payload = {
      topModule: "top",
      nodes: [],
      edges: [],
      artifacts: { functional: fixture },
    };
    await openViewerWindow("synthesis", "Synthesis Explorer", payload);
    assert.equal(request.command, "open_viewer_window");
    assert.equal(request.args.request.kind, "synthesis");
    assert.match(request.args.request.label, /^viewer-synthesis-/);
    assert.deepEqual(JSON.parse(request.args.request.payload).payload, payload);
  } finally {
    globalThis.window = previous;
  }
});
test("source expression overlap uses preserved columns and supports vector index direction", () => {
  const file = [{ name: "top.sv", content: "RTL" }];
  const clone = structuredClone(graph);
  clone.nets = [];
  clone.nodes = [
    {
      ...graph.nodes[0],
      sources: [
        { file: "src/top.sv", line: 1, column: 20, endLine: 1, endColumn: 30 },
      ],
    },
  ];
  assert.deepEqual(sourceMatches(clone, file, "top.sv", 1, 1, 1, 5), []);
  assert.equal(sourceMatches(clone, file, "top.sv", 1, 1, 22, 25).length, 1);
  const net = { ...graph.nets[0], upto: true };
  assert.equal(
    waveformCandidates(
      net,
      [{ id: "a", name: "tb.dut.a [4:5]", width: 2 }],
      "tb.dut",
    ).length,
    1,
  );
});

test("FSM stateful boundaries and binary metadata stay authoritative", () => {
  assert.equal(parameterNumber("00000011"), 3);
  assert.equal(parameterNumber("auto"), undefined);
  assert.equal(parameterNumber("1".repeat(64)), undefined);
  const fsmGraph = structuredClone(graph);
  fsmGraph.nodes.find((node) => node.id === "cell:reg").category = "fsm";
  assert.ok(
    traceGraph(fsmGraph, "port:a", "forward").boundaries.has("cell:reg"),
  );
});

test("multiline VCD timescales are retained; absent units remain unspecified ticks", () => {
  assert.equal(parseVcd("$timescale\n  10 ps\n$end\n#20").timescale, "10ps");
  assert.equal(parseVcd("#20").timescale, "ticks");
});

test("opaque module interiors stop structural traversal until entered", () => {
  const result = traceGraph(graph, "port:a", "forward", false);
  assert.ok(result.boundaries.has("cell:child"));
});

test("constant-folded aliases never acquire recorded RTL values by name alone", () => {
  assert.deepEqual(
    waveformCandidates(
      { ...graph.nets[0], bits: ["0", 3] },
      [{ id: "a", name: "tb.dut.a [5:4]", width: 2 }],
      "tb.dut",
    ),
    [],
  );
});

test("wire declarations highlight recorded numeric connections and their actual drivers", () => {
  const result = sourceAssociations(graph, ["net:q"]);
  assert.ok(result.nodes.has("cell:reg"));
  assert.ok(result.edges.size);
  assert.ok(!sourceAssociations(graph, ["net:constants"]).edges.size);
});

test("logic depth cuts sequential/module paths and marks feedback unresolved", () => {
  const depth = logicDepth(graph);
  assert.equal(depth.depths.get("cell:add"), 1);
  assert.equal(depth.depths.get("cell:reg"), 0);
  assert.equal(depth.depths.get("cell:after"), 1);
  assert.equal(depth.depths.get("cell:child"), 0);
  assert.equal(depth.depths.has("cell:feedback"), false);
  assert.equal(depth.unresolved, 1);
  const chain = buildHardwareGraph(
    {
      modules: {
        top: {
          ports: {
            a: { direction: "input", bits: [1] },
            y: { direction: "output", bits: [4] },
          },
          cells: {
            a: cell("$not", { A: [1], Y: [2] }, { A: "input", Y: "output" }),
            b: cell("$not", { A: [2], Y: [3] }, { A: "input", Y: "output" }),
            c: cell("$not", { A: [3], Y: [4] }, { A: "input", Y: "output" }),
          },
        },
      },
    },
    "top",
  );
  assert.equal(logicDepth(chain).max, 3);
  assert.equal(logicDepth(chain).depths.get("port:y"), 3);
});

test("scope suggestions retain exact-width unambiguous aliases and explicit paths", () => {
  const signals = [
    { id: "a", name: "tb.dut.a [5:4]", width: 2 },
    { id: "b", name: "tb.other.a", width: 1 },
    { id: "q", name: "tb.dut.q", width: 2 },
  ];
  assert.deepEqual(waveformScopes(graph, signals), [
    { path: "tb.dut", matches: 2 },
  ]);
  assert.equal(
    waveformScopes(graph, [...signals, { ...signals[0], id: "duplicate" }])[0]
      .matches,
    1,
  );
});

test("recorded connection values follow destination bit order for slices and reversals", () => {
  const bits = new Map([
    [2, { value: "1", changed: false }],
    [3, { value: "0", changed: true }],
  ]);
  const edge = graph.edges.find((edge) => edge.from === "port:a");
  assert.deepEqual(connectionValue(edge, bits), { value: "01", changed: true });
  const reversed = {
    ...edge,
    connections: edge.connections.map((c) => ({
      ...c,
      toIndex: 1 - c.toIndex,
    })),
  };
  assert.equal(connectionValue(reversed, bits).value, "10");
  const slice = {
    ...edge,
    width: 1,
    connections: [{ bit: 2, fromIndex: 0, toIndex: 5 }],
  };
  assert.equal(connectionValue(slice, bits).value, "1");
  assert.equal(
    connectionValue(
      {
        ...edge,
        connections: [
          { bit: "0", fromIndex: 0, toIndex: 0 },
          edge.connections[1],
        ],
      },
      bits,
    ),
    undefined,
  );
  assert.equal(connectionValue(edge, new Map()), undefined);
  assert.equal(
    connectionValue(
      { ...edge, connections: [edge.connections[0], edge.connections[0]] },
      bits,
    ),
    undefined,
  );
});

test("ELK reserves wire-label geometry outside symbol bodies", async () => {
  const layout = await createElkLayout(graph, new ELK());
  for (const edge of layout.edges) {
    assert.ok(edge.labelVisible);
    const width = Math.min(26, edge.label.length) * 6 + 64;
    const label = {
      left: edge.x - width / 2,
      right: edge.x + width / 2,
      top: edge.y - 12,
      bottom: edge.y + 6,
    };
    for (const node of layout.nodes) {
      assert.ok(
        label.right <= node.x ||
          label.left >= node.x + node.width ||
          label.bottom <= node.y ||
          label.top >= node.y + node.height,
        `${edge.id} overlaps ${node.id}`,
      );
    }
  }
});

test("layout recovers from worker stack overflow without dropping connectivity", async () => {
  const graph = buildHardwareGraph(fixture, "top");
  let calls = 0;
  const retry = await createElkLayout(graph, {
    async layout(input) {
      calls++;
      if (calls === 1) throw new RangeError("Maximum call stack size exceeded");
      assert.equal(
        input.layoutOptions["elk.layered.nodePlacement.strategy"],
        "SIMPLE",
      );
      return new ELK().layout(input);
    },
  });
  assert.equal(calls, 2);
  assert.equal(retry.nodes.length, graph.nodes.length);
  assert.equal(retry.edges.length, graph.edges.length);
  assert.match(retry.notice, /Simplified/);
  const fallback = await createElkLayout(graph, {
    async layout() {
      throw new RangeError("Maximum call stack size exceeded");
    },
  });
  assert.deepEqual(
    fallback.nodes.map((node) => node.id),
    graph.nodes.map((node) => node.id),
  );
  assert.deepEqual(
    fallback.edges.map((edge) => edge.id),
    graph.edges.map((edge) => edge.id),
  );
  assert.ok(
    fallback.nodes.every((node) => node.layoutPins.length === node.pins.length),
  );
  assert.ok(
    fallback.edges.every(
      (edge) => edge.path && Number.isFinite(edge.bounds.width),
    ),
  );
  assert.match(fallback.notice, /Basic routing/);
  await assert.rejects(
    createElkLayout(graph, {
      async layout() {
        throw new Error("Invalid graph");
      },
    }),
    /Invalid graph/,
  );
});

test("long routed edges calculate bounds without argument-stack overflow", async () => {
  const graph = buildHardwareGraph(fixture, "top");
  const layout = await createElkLayout(graph, {
    async layout(input) {
      return {
        ...input,
        edges: [
          {
            ...input.edges[0],
            sections: [
              {
                startPoint: { x: 0, y: 0 },
                bendPoints: Array.from({ length: 150000 }, (_, i) => ({
                  x: i,
                  y: i % 10,
                })),
                endPoint: { x: 150000, y: 0 },
              },
            ],
          },
        ],
      };
    },
  });
  assert.deepEqual(layout.edges[0].bounds, {
    x: 0,
    y: 0,
    width: 150000,
    height: 9,
  });
});
