import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const root = fileURLToPath(new URL("..", import.meta.url));
export const app = path.resolve(root, "../allora-fpga");
export const cache = path.join(root, ".cache");
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function run(exe, args, options = {}) {
  const child = spawn(exe, args, { stdio: "inherit", ...options });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${exe} failed (${code ?? signal})`)),
    );
  });
}
export function requireTools() {
  if (process.platform !== "darwin")
    throw new Error("The recorder requires macOS 15+");
  for (const tool of ["ffmpeg", "ffprobe", "swiftc"]) {
    if (spawnSync("/usr/bin/which", [tool]).status !== 0)
      throw new Error(
        tool === "swiftc"
          ? "Missing Xcode Command Line Tools. Run: xcode-select --install"
          : "Missing FFmpeg. Install explicitly with: brew install ffmpeg",
      );
  }
}
export async function captureBinary() {
  await mkdir(cache, { recursive: true });
  const source = path.join(root, "scripts/Capture.swift");
  const binary = path.join(cache, "allora-capture");
  if (
    !(await stat(binary).catch(() => null)) ||
    (await stat(source)).mtimeMs > (await stat(binary)).mtimeMs
  ) {
    await run("swiftc", [
      "-parse-as-library",
      source,
      "-o",
      binary,
      "-module-cache-path",
      path.join(cache, "swift-modules"),
    ]);
  }
  return binary;
}
export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
export async function writeJson(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}
export async function probe(file) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}
