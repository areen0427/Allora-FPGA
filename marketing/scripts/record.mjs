import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile, open } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  root,
  app,
  cache,
  sleep,
  run,
  requireTools,
  captureBinary,
  readJson,
  writeJson,
} from "./common.mjs";

export async function record(name = "main-overview") {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid demo name");
  requireTools();
  const demo = await readJson(path.join(root, "demos", `${name}.json`));
  const fixture = demo.fixture ?? "virtual-led-counter";
  if (!/^[a-z0-9-]+$/.test(fixture))
    throw new Error("Invalid project fixture");
  const binary = await captureBinary();
  const token = randomBytes(32).toString("hex");
  const configPath = path.join(cache, "tauri-demo.json");
  await writeJson(configPath, {
    build: { devUrl: "http://127.0.0.1:5178", beforeDevCommand: "npm run dev" },
    app: {
      windows: [
        {
          label: "main",
          title: "Allora FPGA — Marketing",
          width: 1200,
          height: 900,
          resizable: false,
          fullscreen: false,
        },
      ],
    },
  });
  // Copy only tracked input material, never previous VCD/build artifacts.
  const projectPath = path.join(cache, "project");
  await rm(projectPath, { recursive: true, force: true });
  await mkdir(projectPath, { recursive: true });
  for (const entry of ["allora-project.json", "src", "constraints"]) {
    await cp(
      path.join(root, "../examples", fixture, entry),
      path.join(projectPath, entry),
      { recursive: true },
    );
  }
  const log = await open(path.join(cache, "allora.log"), "w");
  const child = spawn(
    "npm",
    ["run", "tauri", "--", "dev", "--no-watch", "--config", configPath],
    {
      cwd: app,
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
      env: { ...process.env, VITE_ALLORA_DEMO_TOKEN: token },
    },
  );
  let recorder;
  let recorderDone;
  const stopFile = path.join(cache, "stop-recording");
  const journal = { demo: name, projectPath, shots: [], commands: [] };
  const rawPath = path.join(root, "raw", `${name}.mp4`);
  const send = async (command) => {
    if (command.action === "open-project")
      command = { ...command, path: projectPath };
    const response = await fetch(
      "http://127.0.0.1:5178/__allora_demo/command",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-allora-demo-token": token,
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(125000),
      },
    );
    if (!response.ok) throw new Error(`Demo transport: ${response.status}`);
    const value = await response.json();
    journal.commands.push({ command, ...value });
    if (value.error) throw new Error(value.error);
    return value.result;
  };
  try {
    console.log(
      "Launching real Allora Tauri app; log: marketing/.cache/allora.log",
    );
    const deadline = Date.now() + 180000;
    for (;;) {
      if (child.exitCode !== null)
        throw new Error("Allora exited; inspect marketing/.cache/allora.log");
      try {
        const response = await fetch(
          "http://127.0.0.1:5178/__allora_demo/poll",
          {
            headers: { "x-allora-demo-token": token },
            signal: AbortSignal.timeout(500),
          },
        );
        if (response.ok) break;
      } catch {
        /* Wait for compiler and Vite. */
      }
      if (Date.now() > deadline)
        throw new Error("Allora did not start in 180 seconds");
      await sleep(500);
    }
    await send({ action: "status" });
    for (const command of demo.prepare ?? []) await send(command);
    // Permission check is after launch, before any attempt to obtain frames.
    await run(binary, ["--check"]);
    await rm(stopFile, { force: true });
    await rm(rawPath, { force: true });
    recorder = spawn(binary, ["Allora FPGA — Marketing", rawPath, stopFile], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    recorderDone = new Promise((resolve, reject) => {
      recorder.on("error", reject);
      recorder.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Capture exited ${code}`)),
      );
    });
    recorderDone.catch(() => {});
    await Promise.race([
      new Promise((resolve) =>
        recorder.stdout.on("data", (data) => {
          if (data.toString().includes("RECORDING")) resolve();
        }),
      ),
      recorderDone.then(() => {
        throw new Error("Capture ended before it was ready");
      }),
      sleep(15000).then(() => {
        throw new Error("Recorder readiness timeout");
      }),
    ]);
    const start = performance.now();
    for (const step of demo.steps) {
      if (step.shot) {
        const time = (performance.now() - start) / 1000;
        journal.shots.push({ name: step.shot, time });
        console.log(`Shot: ${step.shot} (${time.toFixed(2)}s)`);
      }
      if (step.action)
        for (let count = 0; count < (step.repeat ?? 1); count++) {
          await send(step);
          if (step.between) await sleep(step.between);
        }
      if (step.wait) await sleep(step.wait);
    }
    await writeFile(stopFile, "stop");
    await recorderDone;
    journal.duration = (performance.now() - start) / 1000;
    console.log(`Captured ${rawPath}`);
  } finally {
    if (recorder && recorder.exitCode === null) {
      await writeFile(stopFile, "stop");
      await recorderDone.catch(() => {});
    }
    await writeJson(path.join(root, "raw", `${name}.json`), journal);
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* Already closed */
    }
    await log.close();
  }
  return rawPath;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  record(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
