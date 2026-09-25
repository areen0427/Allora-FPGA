import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { root, cache, run, readJson, probe, writeJson } from "./common.mjs";
import { record } from "./record.mjs";
import { inspect } from "./inspect.mjs";

export async function render(name = "main-overview", options = {}) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid demo name");
  const edit = await readJson(path.join(root, "demos", `${name}.edit.json`));
  const totalSeconds = edit.seconds ?? 12;
  const targetFrames = Math.round(totalSeconds * 60);
  if (
    Math.round(edit.shots.reduce((sum, shot) => sum + shot.seconds, 0) * 60) !==
    targetFrames
  )
    throw new Error(`Edit must contain exactly ${targetFrames} frames`);
  const raw = path.join(root, "raw", `${name}.mp4`);
  const journal = await readJson(path.join(root, "raw", `${name}.json`));
  const source = (await probe(raw)).streams.find(
    (stream) => stream.codec_type === "video",
  );
  const duration = Number((await probe(raw)).format.duration);
  const plates = path.join(cache, "plates");
  await mkdir(plates, { recursive: true });
  await run("swift", [
    "-module-cache-path",
    path.join(cache, "swift-modules"),
    path.join(root, "scripts/Titles.swift"),
    plates,
  ]);
  const rendered = [];
  for (const [index, shot] of edit.shots.entries()) {
    const marker = journal.shots.find((item) => item.name === shot.marker);
    if (!marker) throw new Error(`Missing shot marker: ${shot.marker}`);
    const start = marker.time + (shot.offset ?? 0);
    if (start + shot.seconds > duration)
      throw new Error(`Shot ${shot.marker} extends past source footage`);
    const output = path.join(cache, `shot-${index}.mp4`);
    // Normalized crop rectangles are editorial reframing only, never input coordinates.
    const crop = shot.crop ?? [0, 0.028, 1, 0.972];
    const [x, y, w, h] = crop.map(
      (value, i) =>
        Math.floor((value * (i % 2 === 0 ? source.width : source.height)) / 2) *
        2,
    );
    if (
      x < 0 ||
      y < 0 ||
      w < 2 ||
      h < 2 ||
      x + w > source.width ||
      y + h > source.height
    )
      throw new Error(`Invalid crop for ${shot.marker}`);
    const portrait = shot.layout === "portrait";
    const fit = shot.layout === "fit";
    if (portrait && Math.abs(w / h - 1080 / 1600) > 0.008)
      throw new Error(`Portrait crop for ${shot.marker} must match 1080:1600`);
    const panelW = portrait
      ? 1080
      : fit
        ? Math.floor(Math.min(1040, (1560 * w) / h) / 2) * 2
        : Math.floor(Math.min(1000, (1080 * w) / h) / 2) * 2;
    const panelH = portrait ? 1600 : Math.floor((panelW * h) / w / 2) * 2;
    const panelX = (1080 - panelW) / 2;
    const panelY = fit ? 160 + (1600 - panelH) / 2 : portrait ? 160 : Math.floor((1920 - panelH) / 2);
    const count = Math.round(shot.seconds * 60);
    const filters = [
      ...(fit
        ? [
            `[0:v]fps=60,split=2[fgsrc][bgsrc]`,
            `[bgsrc]crop=${w}:${h}:${x}:${y},scale=360:534:force_original_aspect_ratio=increase,crop=360:534,boxblur=12:2,scale=1080:1600,eq=brightness=-0.17:saturation=0.9,colorchannelmixer=rr=0.58:gg=0.84:bb=1,drawbox=x=0:y=0:w=1080:h=1600:color=0x061f30@0.4:t=fill[blurred]`,
            `[1:v][blurred]overlay=0:160:shortest=1[canvas]`,
          ]
        : [`[0:v]fps=60[fgsrc]`, `[1:v]null[canvas]`]),
      `[fgsrc]crop=${w}:${h}:${x}:${y},scale=2000:-2:flags=lanczos,zoompan=z='1+${shot.zoom ?? 0.018}*on/${count}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${panelW}x${panelH}:fps=60,setsar=1[base]`,
      `[base]null[v]`,
      shot.fade
        ? `[v]format=rgba,fade=t=in:d=${shot.fade}:alpha=1,fade=t=out:st=${shot.seconds - shot.fade}:d=${shot.fade}:alpha=1[ready]`
        : `[v]null[ready]`,
      `[canvas][ready]overlay=${panelX}:${panelY}:shortest=1[composed]`,
      `[composed][2:v]overlay=0:0:shortest=1,format=yuv420p[out]`,
    ].join(";");
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(start),
      "-i",
      raw,
      "-loop",
      "1",
      "-framerate",
      "60",
      "-i",
      path.join(plates, "background.png"),
      "-loop",
      "1",
      "-framerate",
      "60",
      "-i",
      path.join(plates, `${shot.title}.png`),
      "-filter_complex",
      filters,
      "-map",
      "[out]",
      "-an",
      "-frames:v",
      String(count),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "17",
      "-r",
      "60",
      "-video_track_timescale",
      "60000",
      output,
    ]);
    rendered.push(output);
  }
  const concat = path.join(cache, "concat.txt");
  await writeFile(
    concat,
    rendered
      .map((file) => `file '${file.replaceAll("'", "'\\''")}'`)
      .join("\n"),
  );
  const output = path.join(root, "output", edit.output);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concat,
  ];
  if (options.audio) args.push("-i", path.resolve(options.audio));
  args.push("-map", "0:v", "-c:v", "copy");
  if (options.audio)
    args.push(
      "-map",
      "1:a",
      "-af",
      `afade=t=in:d=0.15,afade=t=out:st=${totalSeconds - 0.5}:d=0.5`,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
    );
  else args.push("-an");
  args.push("-t", String(totalSeconds), "-movflags", "+faststart", output);
  await run("ffmpeg", args);
  const metadata = await probe(output);
  const video = metadata.streams.find(
    (stream) => stream.codec_type === "video",
  );
  if (
    Number(video.nb_frames) !== targetFrames ||
    Number(video.duration) !== totalSeconds ||
    video.width !== 1080 ||
    video.height !== 1920 ||
    video.codec_name !== "h264"
  )
    throw new Error("Final export failed duration/format verification");
  await writeJson(path.join(root, "output", "render-report.json"), {
    source: raw,
    sourceFrameRate: source.avg_frame_rate,
    sourceSize: [source.width, source.height],
    edit,
    video,
    audio: options.audio ?? null,
  });
  await inspect(output, edit.inspectTimes);
  console.log(`Rendered exactly ${targetFrames} frames / ${totalSeconds} seconds: ${output}`);
  return output;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const name = process.argv[2] ?? "main-overview";
  const audioIndex = process.argv.indexOf("--audio");
  (async () => {
    if (!process.argv.includes("--reuse")) await record(name);
    await render(name, {
      audio: audioIndex >= 0 ? process.argv[audioIndex + 1] : undefined,
    });
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
