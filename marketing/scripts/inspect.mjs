import path from "node:path";
import { mkdir } from "node:fs/promises";
import { root, run, probe, writeJson } from "./common.mjs";
export async function inspect(
  file,
  times = [0.15, 1.8, 2.1, 4.35, 4.6, 6.35, 6.6, 7.4, 8.2, 10.4, 10.6, 11.8],
) {
  const folder = path.join(root, "frames", path.basename(file, ".mp4"));
  await mkdir(folder, { recursive: true });
  const metadata = await probe(file);
  await writeJson(path.join(folder, "probe.json"), metadata);
  for (let index = 0; index < times.length; index++) {
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(times[index]),
      "-i",
      file,
      "-frames:v",
      "1",
      path.join(folder, `${String(index).padStart(2, "0")}.png`),
    ]);
  }
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    "1",
    "-i",
    path.join(folder, "%02d.png"),
    "-vf",
    `scale=270:-1,tile=4x${Math.ceil(times.length / 4)}:padding=8:margin=8:color=0x10202a`,
    "-frames:v",
    "1",
    path.join(folder, "contact-sheet.jpg"),
  ]);
  await writeJson(path.join(folder, "times.json"), times);
  console.log(`Inspect: ${path.join(folder, "contact-sheet.jpg")}`);
  return folder;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  inspect(
    path.resolve(
      process.argv[2] ?? path.join(root, "output/allora-overview-12s.mp4"),
    ),
  ).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
