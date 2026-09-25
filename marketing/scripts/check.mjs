import { run, requireTools, captureBinary } from "./common.mjs";
try {
  requireTools();
  await run(await captureBinary(), ["--check"]);
  console.log(
    "Native capture and FFmpeg are ready. FPGA tools are checked by Allora when opening the demo.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
