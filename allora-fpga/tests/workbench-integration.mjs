// Invoked by the Rust test after Yosys discovery and compiling the production harness.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build } from "vite";
const [exe, portsFile] = process.argv.slice(2);
const folder = await mkdtemp(resolve(".workbench-test-"));
let child;
try {
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      outDir: folder,
      lib: {
        entry: resolve("src/lib/peripheralWorkbench.ts"),
        formats: ["es"],
        fileName: "model",
      },
      minify: false,
    },
  });
  const {
    WorkbenchRuntime,
    readWorkbench,
    writeWorkbench,
    migrateLegacy,
    validate,
    lit,
    options,
  } = await import(pathToFileURL(resolve(folder, "model.js")));
  const metadata = await readFile(
    "../examples/peripheral-workbench/allora-project.json",
    "utf8",
  );
  const config = readWorkbench(
    [{ name: "allora-project.json", content: metadata }],
    "workbench_demo",
  );
  const ports = JSON.parse(await readFile(portsFile, "utf8"));
  assert.deepEqual(validate(config, ports), {});
  const saved = writeWorkbench(metadata, config);
  await writeFile(resolve(folder, "allora-project.json"), saved);
  assert.deepEqual(
    readWorkbench(
      [
        {
          name: "allora-project.json",
          content: await readFile(
            resolve(folder, "allora-project.json"),
            "utf8",
          ),
        },
      ],
      "workbench_demo",
    ),
    config,
  );
  assert.deepEqual(
    readWorkbench(
      [{ name: "allora-project.json", content: saved }],
      "workbench_demo",
    ),
    config,
  );
  assert.equal(JSON.parse(saved).boardId, "icebreaker");
  const legacy = [
    {
      name: "allora-project.json",
      content: JSON.stringify({
        simulation: {
          engine: "verilator",
          peripherals: [
            { id: "switch-0", signal: "controls", bit: 1, activeHigh: false },
          ],
        },
      }),
    },
  ];
  const migrated = migrateLegacy(
    readWorkbench(legacy, "workbench_demo"),
    ports,
  );
  assert.equal(migrated.devices[0].connections.signal.width, 2);
  assert.equal(migrated.devices[0].activeHigh, false);
  const changed = structuredClone(config);
  changed.devices[0].connections.signal.width = 4;
  assert.match(validate(changed, ports).button[0], /range changed/);
  changed.devices[0].connections.signal = {
    signal: "removed",
    bit: 0,
    width: 1,
  };
  assert.match(validate(changed, ports).button[0], /removed/);
  changed.devices[0].connections.signal = changed.devices[1].connections.signal;
  assert.match(validate(changed, ports).button[0], /Conflicting/);
  assert.ok(validate(changed, ports).switch);
  changed.devices[0].connections.signal = { signal: "leds", bit: 0, width: 2 };
  assert.match(validate(changed, ports).button[0], /direction/);
  changed.devices[0].connections.signal = {
    signal: "controls",
    bit: 2,
    width: 2,
  };
  assert.match(validate(changed, ports).button[0], /invalid bit/);
  const observed = structuredClone(config);
  observed.devices.push({ ...observed.devices[2], id: "observer" });
  assert.deepEqual(validate(observed, ports), {});
  assert.equal(
    options(
      [{ name: "bus", width: 4, offset: 4, upto: true, direction: "output" }],
      false,
    )[0].label,
    "bus[7]",
  );

  async function start() {
    child = spawn(exe, [], { stdio: ["pipe", "pipe", "inherit"] });
    const lines = createInterface({ input: child.stdout })[
      Symbol.asyncIterator
    ]();
    let time = 0;
    async function command(text, prefix = "ALLORA:") {
      child.stdin.write(text + "\n");
      for (;;) {
        const line = await lines.next();
        if (line.done) throw Error("RTL process terminated");
        if (line.value.startsWith(prefix))
          return JSON.parse(line.value.slice(prefix.length));
      }
    }
    const period = Math.floor(1e12 / config.frequency);
    const api = {
      async setInput(_session, signal, value) {
        const point = await command(`SET ${signal} ${value}`);
        return { ...point, simTimePs: time };
      },
      async step(_session, cycles) {
        const points = await command(
          `TRACE clk ${cycles} ${cycles}`,
          "ALLORA_TRACE:",
        );
        assert.equal(
          points.length,
          cycles * 2,
          "all half-cycle events captured, not only trailing 80",
        );
        const trace = points.map((p) => ({
          simTimePs: time + Math.floor((period * p.tick) / 2),
          values: p.values,
        }));
        time += period * cycles;
        return {
          trace,
          state: { simTimePs: time, values: trace.at(-1).values },
        };
      },
    };
    const rt = new WorkbenchRuntime(1, config, await command("STATE"), api);
    await rt.initialize();
    return rt;
  }
  async function stop() {
    const exited = new Promise((r) => child.once("exit", r));
    child.stdin.end("QUIT\n");
    await exited;
  }
  let rt = await start();
  const [button, toggle, leds, display] = config.devices;
  assert.equal(rt.snapshot.values.controls, "0");
  assert.equal(rt.snapshot.values.segments, "63");
  await rt.input(button, true);
  assert.equal(rt.snapshot.values.leds, "3");
  assert.equal(rt.snapshot.values.segments, "255");
  assert.ok(lit(display, "dp", rt.snapshot));
  await rt.input(toggle, true);
  assert.equal(rt.snapshot.values.leds, "0");
  assert.ok(
    rt.activity.display > 0,
    "display transitions are processed before UI snapshots",
  );
  await rt.input(button, false);
  assert.equal(rt.snapshot.values.leds, "1");
  assert.ok(lit(leds, "0", rt.snapshot));
  assert.equal(lit({ ...leds, activeHigh: false }, "0", rt.snapshot), false);
  await rt.input({ ...toggle, activeHigh: false }, true);
  assert.equal(
    rt.snapshot.values.controls,
    "0",
    "active-low host input reaches RTL",
  );
  const pausedTime = rt.snapshot.simTimePs;
  rt.uarts.get("uart").enqueue([0x55, 0xa3, 0x00, 0xff]);
  assert.equal(
    rt.snapshot.simTimePs,
    pausedTime,
    "enqueue while paused does not clock RTL",
  );
  await rt.advance(1);
  assert.equal(rt.cycle, 1);
  await rt.advance(1200);
  assert.equal(
    rt.snapshot.values.received,
    "255",
    "RTL UART receiver accepted serialized bytes",
  );
  assert.deepEqual(
    rt.uarts.get("uart").bytes,
    [0x55, 0xa3, 0, 255],
    "host decoder receives real RTL echo, across batches",
  );
  assert.equal(rt.uarts.get("uart").errors, 0);
  await stop();
  config.devices[1].initial = true;
  rt = await start();
  assert.equal(rt.cycle, 0);
  assert.equal(rt.snapshot.simTimePs, 0);
  assert.equal(rt.snapshot.values.received, "0");
  assert.equal(
    rt.snapshot.values.controls,
    "2",
    "reset restores configured switch initial state",
  );
  assert.deepEqual(rt.uarts.get("uart").bytes, []);
  await rt.advance(1);
  assert.equal(rt.cycle, 1);
  await stop();
  console.log(
    "Workbench integration PASS: real RTL inputs, vectors, polarity, display, UART, pause/step/reset/stop/restart, persistence, migration, validation.",
  );
} finally {
  child?.kill();
  await rm(folder, { recursive: true, force: true });
}
