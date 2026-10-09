# Fullscreen cinematic edit

Run from the repository root:

```sh
python3 marketing/scripts/cinematic.py --capture

# Re-edit existing captures:
python3 marketing/scripts/cinematic.py
```

The capture runs the real Allora Tauri app fullscreen, uses iCEBreaker and the async-reset DFF fixture, writes the design/testbench into the actual editor, runs real Yosys/Icarus/nextpnr/icepack operations, assigns physical pins, and opens the actual timing viewer fullscreen. Capture requires the existing macOS screen-recording permission. Only the development marketing process opens viewer windows fullscreen; regular app launches retain their usual behavior.

`demos/cinematic.timeline.json` is the editable shot/camera timeline. Camera keyframes are `[seconds, centerX, centerY, zoom]`, with normalized positions and cubic smoothstep interpolation. Fast camera movements use weighted temporal exposure samples, so blur follows the camera's direction. Each source segment has its own playback rate. Output is 28 seconds of workflow and exactly 300 logo frames (five seconds), at 60 fps, with no audio or added typography.

Exports:

- `output/allora-cinematic-landscape.mp4`: capture-native landscape resolution.
- `output/allora-cinematic-tiktok.mp4`: 1080 × 1920, landscape centered on black.
- `output/cinematic-qa.json`: ffprobe metadata and duration/frame assertions.

The DFF has no register-to-register clock path. The timing report honestly displays this along with its post-route asynchronous/output delays; no Fmax or slack is invented. The testbench checks initial reset, data capture, clearing, and asynchronous reset using `$fatal` assertions.

Raw MP4s/journals are under `raw/`; encoded shot intermediates are under `.cache/cinematic/`. The preserved project, real bitstream, constraints, build history, testbench and VCD are under `.cache/cinematic-project/`. Camera crops are editorial reframing of real UI footage. No application UI, tool results, or waveforms are replaced.

Camera revision: action shots use steady framing, with matched framing across synthesis, simulation/waveform, pin mapping, and bitstream shot pairs. The welcome and board shots retain only a gentle centered drift. The original code-writing shots and five-second logo ending were reused without re-rendering. Previous exports are saved as `output/allora-cinematic-*-original-camera.mp4`.

Pacing revision: Build, synthesis, simulation, bitstream, board selection, and pin mapping receive more screen time. The workflow is now 31.5 seconds plus the unchanged five-second logo ending (36.5 seconds total). The testbench camera zoom was reduced by 0.12; other camera keyframes retain their previous values and timing.
