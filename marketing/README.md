# Allora marketing capture

This directory records **the real Tauri application**, executes real Verilator/Yosys operations, and edits the resulting window footage. It never generates replacement UI screenshots or simulated toolchain results.

## Quick start

From `allora-fpga/`:

```sh
npm run demo:check
npm run demo:record -- main-overview
npm run demo:record -- simulate-overview
npm run demo:record -- build-overview
npm run demo:record -- build-dff-icebreaker

# Capture, render and extract inspection frames in one command:
npm run teaser -- main-overview
npm run teaser -- build-dff-icebreaker

# Re-edit the most recent capture without launching Allora again:
npm run teaser -- main-overview --reuse
npm run teaser -- build-dff-icebreaker --reuse
npm run demo:inspect -- ../marketing/output/allora-overview-12s.mp4
```

The final export is `marketing/output/allora-overview-12s.mp4`: exactly 720 frames, 12 seconds, 1080 × 1920, 60 fps, H.264, yuv420p, fast-start MP4. The first version is silent. Optional **licensed/local** audio:

The separate iCEBreaker build-flow export is `marketing/output/allora-icebreaker-dff-build-15s.mp4`: exactly 900 frames, 15 seconds, with the same vertical H.264 format. It uses `examples/async-reset-dff-icebreaker`, maps the four HDL ports in the app, and records real Yosys synthesis and iCE40 bitstream generation. Its programming scene shows the actual iceprog and board detection state; a connected board is required before flashing can be shown as successful.

```sh
npm run teaser -- main-overview --reuse --audio /absolute/path/to/licensed-audio.wav
```

Audio is encoded as 48 kHz AAC with short fades. No audio is downloaded. Video frame duplication fills static/variable-rate ScreenCaptureKit samples onto a 60 fps timeline; it does not invent motion.

Requirements: macOS 15+, Xcode Command Line Tools, Node 22.18+ (including native TypeScript stripping for the transport test), the app's existing npm/Rust dependencies, FFmpeg/FFprobe, Yosys and Verilator. Full bitstream demos additionally require the selected board's nextpnr/packer and correct constraints. Missing dependencies are reported, never installed automatically:

```sh
brew install ffmpeg
xcode-select --install
```

Do not run two capture/render processes at once: `.cache/project`, the fixed port, and temporary edit files intentionally belong to one marketing session. Existing outputs with the same scenario name are replaced; archive a take before recording another.

## macOS permissions

The helper uses Apple's [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit) with a desktop-independent **single-window** filter. It captures only the exact `Allora FPGA — Marketing` window, hides the cursor, omits window shadows, and captures no audio. Other apps, the desktop, Terminal and notifications are excluded by the window filter. It does not require Accessibility, Apple Events or coordinate clicking.

If the permission preflight fails, grant **System Settings → Privacy & Security → Screen & System Audio Recording** to the application launching the command: **Codex** when run by Codex, or **Terminal** when run there. If macOS lists the helper itself, enable `allora-capture` (`marketing/.cache/allora-capture`). The OS dialog identifies the responsible process. Quit and reopen that host app after granting permission, then repeat the same command. The script stops instead of bypassing macOS privacy controls.

The Swift recorder is built locally into `.cache/`. It waits for the recording-start callback before the scenario runs and waits for the finalization callback before returning. A stop file ends normal recording; a 180-second watchdog bounds abandoned captures. If an interrupted host leaves a process running, close the window named **Allora FPGA — Marketing** and stop that marketing command before retrying. `marketing/.cache/allora.log` contains native launch/build errors.

## Architecture and production isolation

- Normal launch remains `npm run tauri dev`; the normal app, UI, settings and FPGA services are unchanged.
- `record.mjs` launches Tauri with a temporary configuration: one 1200 × 900 logical-pixel window, a dedicated `http://127.0.0.1:5178` origin, and a fresh 256-bit token. Retina capture on the development Mac produces 2400 × 1800 footage.
- Marketing storage is cleared only on that explicit demo origin. Normal development/release recents and preferences use other origins. The counter inputs are copied into `.cache/project`; simulation/autosave outputs stay in that copy.
- `vite-demo.ts` is a **serve-only** Vite plugin. The local authenticated queue accepts one command at a time, requires the token header, limits requests to 64 KiB, and times out at 120 seconds. It exposes no JavaScript evaluation or shell command endpoint.
- `src/dev/demo.ts` is imported only behind **both** `import.meta.env.DEV` and the explicit token opt-in. Vite tree-shakes it from release output. The App integration reuses the same project loader as the normal folder picker. All other interactions find named/labelled controls, call their normal event handlers, and wait for actual app state. No Rust commands or production Tauri capabilities were added.
- Native compilation happens before useful shot markers. Editing uses those markers instead of assuming how long Verilator/Yosys takes.
- Scripts reject missing controls, ambiguous buttons, disabled actions, failed model assertions, failed synthesis, missing markers and invalid export metadata. Raw JSON journals contain actual UI signal values, command outcomes and capture-relative shot times.

## What was inspected

Navigation is local React state in `src/App.tsx`, `pages/BoardSelect.tsx`, `pages/welcome/HomeView.tsx` and `pages/Dashboard.tsx`; there is no routing library. The welcome shell selects Simulate or Build; opening a folder reads `allora-project.json` through `readProjectWorkspace`, resolves board metadata, restores files/top-level source, then enters Dashboard with an execution target. The Dashboard rail exposes target-specific sections, while the explorer switches targets.

`VirtualFpgaSection` discovers ports with Yosys, compiles a persistent native Verilator model and sends inputs/steps/reset through `lib/virtualFpga.ts`. `VirtualPcbDiagram` draws the board; its switches, buttons and LEDs reflect native RTL state. `SignalWaveformPanel` displays returned half-cycle samples and input changes; signal-picker controls already exist. A separate Testbench path uses Icarus/VCD.

Build provides source editing, physical pin mapping, synthesis/report/schematic, bitstream generation with streamed logs and timing, and programming/serial surfaces. `SynthesisSection` runs Yosys and opens its schematic in another viewer window; the capture deliberately stays on the main window's report. `BitstreamSection` runs the physical toolchain only with usable constraints. The bundled counter has **no physical pin assignments**, so the first teaser demonstrates successful **synthesis**, not a full physical build or programming success. No hardware is programmed.

The safe fixture is `examples/virtual-led-counter`: four LED bits, clock, reset, enable switch and button. The fixed-step demos assert LED `0x8` after eight enabled cycles, then `0xB` after three button-driven cycles. An explicit `run` command also exists for future continuous-run demos. Existing hooks were insufficient for external control; the new bridge is the small developer-only boundary.

## Scenarios and edit recipes

- `demos/main-overview.json`: welcome → compile/reset counter → switch and deterministic steps → button response → waveform → real synthesis/report → welcome.
- `demos/simulate-overview.json`: prepared native simulation, switch/LED and button/LED assertions, waveform.
- `demos/build-overview.json`: source → physical pin view (honestly unmapped) → real synthesis/report.
- `demos/build-dff-icebreaker.json`: async-reset DFF editor → real synthesis → four iCEBreaker pin assignments → real bitstream → programming readiness and board detection. The fixture is `examples/async-reset-dff-icebreaker`.
- `demos/main-overview.edit.json`: six shots totalling 12 seconds. Complete app subjects fit within the central 1600px picture area, with a blurred copy of the same footage filling any spare space; 160px bold-title bands occupy the top and bottom. This is the supplied render recipe; other raw scenarios can be edited by adding a matching `.edit.json`.
- `demos/build-dff-icebreaker.edit.json`: eight shots totalling 15 seconds, with complete UI panels and blurred live-footage edges.

A scenario describes semantic operations, for example:

```json
{"action":"open-project","target":"simulate"}
{"action":"compile"}
{"shot":"simulate","wait":800}
{"action":"switch","name":"SW0"}
{"action":"step","repeat":8,"between":180}
{"action":"assert-signal","name":"leds","value":"0x8"}
{"action":"waveform"}
```

Commands: `home`, `open-project`, `enter` (target), `section` (Editor/Virtual/Testbench/Synthesis/Pins/Health/Bitstream), `compile`, `run`, `pause`, `step`, `reset`, `stop`, `switch`, `press`, `board`, `waveform`, `collapse-explorer`, `synthesize`, `build`, `wait-text`, `assert-text`, `assert-signal`, `status`. `press` accepts `cycles` and `ms`; it releases the button in a `finally` block. `build` starts the existing Generate Bitstream control; pair it with a truthful success wait when creating a fixture with valid physical constraints. No programming command is provided.

Each edit shot selects a named marker, optional time `offset`, `seconds`, a title plate, normalized `[x,y,width,height]` crop, and subtle `zoom`. Crop coordinates describe **editing**, never UI input. Optional `fade` (seconds) fades the footage to/from its composition background; clean cuts are the default. Scaling preserves aspect ratio. A shot with `"layout":"fit"` keeps the selected subject fully in view, with blurred real footage around it; `"layout":"portrait"` uses a validated 1080:1600 crop. The first and last shots are intentionally short and use different real Allora views. `Titles.swift` generates original system-font typography and a restrained gradient; FFmpeg performs frame selection, scaling, zoom, compositing, cuts, optional fades/audio, H.264 export and frame/contact-sheet extraction. No extra font/image libraries are required.

To make a teaser for another feature: inspect its current native behavior, prepare a safe project, add semantic commands only if required, add a JSON scenario and edit recipe, capture real footage, inspect it, adjust the crop/timing, then render and inspect again. Do not relabel stale footage as a feature that did not run.

## Inspection and validation

`frames/<video-name>/` contains full-resolution representative frames, a contact sheet, exact sample times and ffprobe metadata. Inspect beginning, before/after every cut, the action response, and the final frame. Open individual PNGs to assess actual text readability; a small contact sheet alone is insufficient. The renderer verifies resolution, codec, frame count and duration, but a human/Codex visual review is still required. See [EDITING.md](EDITING.md).

```sh
# From the repository root:
node --test marketing/scripts/bridge.test.mjs
cd allora-fpga
npm run build
npm run lint
# Must find no matches in the release bundle:
rg '__allora_demo|connectDemo|Expected one visible button' dist
```

Generated video, frames, journals, native binaries and working projects are ignored by Git; source scripts, scenarios, guides and the empty output folders are tracked. The exported MP4 remains a local deliverable; copy/upload it explicitly when needed.
