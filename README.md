# Allora FPGA

Allora FPGA is a desktop development environment for open-source FPGA workflows. Its goal is a one-app experience: write HDL, inspect and simulate it on a Virtual FPGA, synthesize it, generate a bitstream, and program a physical board without changing projects or rewriting RTL.

```text
                         ALLORA PROJECT
                               │
                           RTL design
                               │
                  ┌────────────┴────────────┐
                  │                         │
           Virtual FPGA               Physical FPGA
                  │                         │
       Verilator simulation          Yosys → nextpnr
                  │                         │
        controls + signals        bitstream → programmer
```

## What works today

- Monaco-based Verilog, SystemVerilog, and VHDL editing with multi-file projects.
- A broad board catalog, physical pin mapping, and generated constraint files.
- Open-source synthesis and place-and-route through Yosys and nextpnr for supported families.
- Bitstream generation, board programming, serial monitoring, build health, and build history.
- A live build preflight checklist in Health and Bitstream, and an RTL module hierarchy beside project files.
- Icarus Verilog testbench simulation with VCD waveform inspection.
- A local-first GitHub publishing workflow with explicit commits, repository creation/selection, safe `origin` setup, first push, and later commit/push status. GitHub sign-in is optional and never part of project creation.
- Settings → AI Integration detects and connects locally installed OpenAI Codex and Claude Code CLIs through each provider's own login flow. Codex CLI sign-in and a live Codex request have been verified on a development Mac; Claude Code support is implemented but has not had a live account test.
- Inside a project, a Usage gauge above Settings shows live CPU and memory use for Allora FPGA and its running child tools on macOS. The panel is available in both Simulate and Build, uses the Ice or Black Ice theme, and closes when clicked outside or with Escape.
- Virtual FPGA V0.1 for interactive Verilog/SystemVerilog designs:
  - structural top-level port discovery through Yosys;
  - actual RTL execution through a persistent Verilator model;
  - virtual clock, reset, push buttons, switches, and LEDs;
  - scalar and vector-bit signal mapping persisted in `allora-project.json`;
  - run, pause, single-step, reset, signal inspection, and optional VCD capture.

The physical workflow remains independent of virtual mappings. A project has one RTL source tree and two execution targets.

## Welcome experience

The initial screen presents **Simulate / Virtual FPGA** and **Build / Physical FPGA** as equal primary paths over a shared molecular-circuit environment. Ice and Black Ice use geometry-matched AI-authored renders with different lighting grades.

- All persistent controls form one compact, right-aligned column with a shared width and edge: Allora, Simulate, Build, Pin Mapper, and the conditional Continue Project card.
- Simulate and Build are semantic buttons with matching dimensions, frosted materials, keyboard focus, and restrained hover depth. Their labels and supporting text remain accessible HTML rather than being baked into the artwork.
- Pin Mapping is a secondary action attached to Build instead of a competing global navigation item.
- Continue Project appears only when a recent project exists. It shows the board and date on one line and the time on a second line. It resumes the last execution target when one is saved, or offers Simulate and Build choices for older projects without one.
- The Allora tile opens a compact product panel with the app version, documentation, implemented shortcuts, supported-board count, and recent-project information.
- The product panel closes on an outside click or Escape.
- The left rail is intentionally minimal: Home remains at the top and Settings sits at the bottom.
- Backgrounds use a sharp, edge-to-edge `cover` treatment with no blur copy, mask, or feathered border. Ice receives a small clarity correction to offset the brighter source render's atmospheric haze.
- Responsive layouts preserve the shared right edge and card width, while reduced-motion preferences disable dimensional card movement.
- Theme artwork lives at `allora-fpga/public/welcome_ice_molecular.png` and `allora-fpga/public/welcome_black_ice_molecular.png`.

## Open-source stack

| Layer                  | Technology                             |
| ---------------------- | -------------------------------------- |
| Desktop shell          | Tauri + Rust                           |
| Interface              | React + TypeScript + Vite              |
| Editor                 | Monaco                                 |
| Interactive simulation | Verilator                              |
| Testbench simulation   | Icarus Verilog (`iverilog`/`vvp`)      |
| Synthesis              | Yosys                                  |
| Place and route        | nextpnr                                |
| Programming            | Board-specific open-source programmers |

## Development

Windows users: see [Windows preview release](WINDOWS_RELEASE.md). This build is
experimental; native project workflows have not yet been verified end to end.
Windows preview work is currently paused while the macOS app is completed.

Prerequisites: Node.js/npm, Rust/Cargo, Yosys, Verilator, Icarus Verilog, and the nextpnr/packer/programmer tools for the physical board you use. OSS CAD Suite supplies most FPGA command-line tools in one package. Allora also searches common Homebrew, MacPorts, and `~/oss-cad-suite/bin` locations.

Publishing requires the system `git` executable. GitHub CLI (`gh`) is detected for diagnostics but is optional. GitHub sign-in also requires the project owner to register an OAuth App, enable Device Flow, and provide its public client ID at build or development time:

```bash
ALLORA_GITHUB_CLIENT_ID=your_client_id npm run tauri dev
```

Do not add a client secret to the desktop application. See [`GITHUB_INTEGRATION.md`](GITHUB_INTEGRATION.md) for the credential model, operation boundaries, registration steps, and safety behavior.

```bash
cd allora-fpga
npm install
npm run tauri dev
```

Validation:

```bash
cd allora-fpga
npm run build
npm run lint
cd src-tauri
cargo test
```

## AI Integration V1

Open **Settings → AI Integration** to check the Codex or Claude Code CLI, view the detected version and executable path, and follow installation guidance if a CLI is missing. **Check Again** reruns detection without restarting Allora. When a CLI is installed, **Connect** starts that provider's login command in macOS Terminal; the provider handles the browser sign-in and stores its own credentials. Allora neither requests nor stores an OpenAI or Anthropic password, API key, or token.

An existing CLI login can appear as **Connected** immediately. Allora determines this from `codex login status` or `claude auth status --json`; it does not make a live model request. A separate `codex exec` request succeeded on the development Mac, confirming that machine's Codex account could reach the service. Claude Code's detection and login path are implemented but have not been verified with a live Claude account. The Codex desktop app's bundled runtime is not treated as a separate CLI installation.

V1 provides connection status only. It does not offer AI chat, FPGA tools, MCP integration, source editing, simulation, synthesis, or programming through either provider.

## Virtual FPGA quick start

1. Choose **Simulate** on the Allora home screen and open an existing project.
2. Allora opens the focused simulation workspace. Mark the desired HDL file as the top-level file if needed.
3. Map a one-bit input to `CLOCK`, the reset input to `RESET`, user inputs to buttons/switches, and output bits to LEDs.
4. Choose a logical clock frequency and select **Compile & Start**.
5. Use **Run**, **Pause**, **Step**, and **Reset**. The board and signal inspector reflect values returned by the compiled RTL model.

An end-to-end counter project lives in [`examples/virtual-led-counter`](examples/virtual-led-counter). Open that directory from Allora's home screen.

### Current V0.1 limits

- Interactive Virtual FPGA supports Verilog/SystemVerilog top-level ports up to 64 bits.
- Top-level `inout` ports and VHDL interactive simulation are not supported yet.
- The signal inspector shows top-level ports; internal signal browsing and a full waveform workspace are future work.
- Clock frequency controls simulated time. Simulation work is deliberately batched and is not tied to wall-clock FPGA speed.

## Project format

Each disk-backed project includes `allora-project.json`, source files, constraints, and generated folders. Virtual hardware is stored under the metadata's `simulation` key and remains separate from physical pin constraints.

```json
{
  "name": "virtual-led-counter",
  "boardId": "icebreaker",
  "topModule": "virtual_led_counter",
  "simulation": {
    "engine": "verilator",
    "clockFrequencyHz": 50000000,
    "peripherals": [
      { "id": "clock-0", "type": "clock", "signal": "clk" },
      { "id": "switch-0", "type": "switch", "signal": "enable" },
      { "id": "led-0", "type": "led", "signal": "leds", "bit": 0 }
    ]
  }
}
```

## Repository layout

- `allora-fpga/` — desktop application and Rust backend.
- `allora-fpga/public/welcome_ice_molecular.png` — bright Ice molecular-circuit welcome environment.
- `allora-fpga/public/welcome_black_ice_molecular.png` — geometry-matched Black Ice lighting variant.
- `allora-website/` — project website.
- `examples/` — projects that can be opened in Allora.
- `CONTINUATION.md` — living engineering handoff; update it after every codebase change.
- `CONTEXT.md` — current product and architecture orientation.
- `PRODUCT_IDEAS.md` — living note for product directions to explore.
- `GITHUB_INTEGRATION.md` — OAuth, credential storage, Git/API/CLI boundaries, and publishing safety model.

## Contributing

Keep simulation and physical hardware as equal targets, prefer reusable typed abstractions, preserve existing workflows, and never substitute JavaScript behavior for the user's RTL. Add a dated entry to `CONTINUATION.md` with the change, validation performed, known limitations, and next useful step.

## License

MIT

## Developer marketing capture

The optional native-window capture and vertical teaser pipeline lives in [`marketing/README.md`](marketing/README.md). From `allora-fpga`, run `npm run teaser -- main-overview` to launch the real app, execute a safe demo, capture it, render a 12-second MP4 and extract inspection frames. The automation bridge is excluded from release builds.

## Memory Asset Studio V1

Open **Memory Asset Studio** from the welcome screen, then open a project or use its dedicated form to create a simulation or physical-board project. The editor's existing Studio button opens the active project directly. Import a PNG, JPEG, raw binary, CSV, or TXT source, adjust conversion settings, choose **Apply settings**, inspect the preview, and choose **Generate files**. The preview is temporary; only generated files are used by the project. A project can contain multiple assets. Rename and remove controls retain stable asset IDs; removal asks whether to keep or delete associated files.

Sources live under `assets/sources/`. `assets/memory-assets.json` stores schema version 1, asset definitions, conversion settings, SHA-256 source/output hashes, output paths, and generation timestamps. Generated `.hex` and optional `_rom.v` files live under `src/generated/`. Existing board, top module, and constraints metadata remain untouched. The generated HDL is included in the editor, Icarus testbench, interactive Verilator/Peripheral Workbench, Yosys diagram, and physical bitstream source workflows; generated `.hex` files are copied into those temporary tool workspaces. Instantiate a generated `<memory_id>_rom` module in your own top module and connect `clk`, `addr`, and `data`.

Each `.hex` file has exactly one lowercase hexadecimal word per line, zero padded to `ceil(wordWidth / 4)` digits. Line 1 is address 0. Images use row-major address `y * width + x`, one pixel or index per word. Monochrome words are one bit, with configurable 0–255 luminance threshold. RGB565 packs red in bits 15:11, green in 10:5, blue in 4:0. Indexed images use 8-bit indices and a separate 16-bit RGB565 palette memory; up to 256 exact colors are sorted numerically, while larger images use deterministic RGB332 buckets. Alpha is composited over black or white before conversion. Optional resize uses nearest-neighbor sampling; leaving width and height blank preserves original dimensions.

Raw binaries support 8/16/24/32-bit words, big or little endian byte order, a byte offset, and reject-or-zero-pad final-word behavior. CSV/TXT tables select a zero-based column and optional header, then quantize signed or unsigned values to 1–32-bit integer or fixed-point words. Rounding can be nearest (JavaScript ties toward positive infinity), floor, or truncate; overflow can reject, saturate, or wrap. The inspector shows addresses, encoded words, and, for images/tables, pixel coordinates or quantization error. The model records source bytes and logical/stored bit counts, so final-word padding is explicit.

Generated ROMs are synchronous: `data` updates on a rising `clk` edge. Address width is at least one bit. An address outside a non-power-of-two memory returns zero. The wrapper uses `$readmemh("src/generated/<name>.hex", mem)`. Reopening a project restores the manifest and settings from disk. Conversion changes remain drafts until applied; Reset discards a draft. The ROM wrapper checkbox controls optional HDL generation. In-app dialogs handle renaming, removal, and conflicts. Source imports, generation, and removal commit file changes with the manifest after checking all expected file versions; conflicts preserve existing files, and write failures attempt rollback. Source or output changes are flagged on inspection; regeneration asks before accepting a modified source and offers overwrite or a new output path for edited outputs. Source files are limited to 8 MB, decoded inputs to 16 million pixels, converted images and memories to one million words. Image previews and the hex inspector are capped for responsiveness. The Studio currently supports PNG/JPEG, simple comma/whitespace numeric columns, and local `$readmemh` tool flows; it does not generate VHDL ROMs.

Run `node --test allora-fpga/tests/memory-assets.test.mjs` to verify converters, compile/simulate generated ROMs with Icarus Verilog and Verilator, and synthesize a project-style ROM with Yosys. The native project-file guards are tested with `cargo test --manifest-path allora-fpga/src-tauri/Cargo.toml --lib memory_asset_tests`.

## Peripheral Workbench

Open **Peripheral Workbench** from the main project navigation in either Build or Simulate mode. The welcome-screen entry opens the existing project creation/selection flow. Physical-board projects keep their board, HDL, top module, build settings, and pin constraints. **Register Builder** remains Coming soon. **Memory Asset Studio** is available from the welcome screen and the editor rail.

1. Add a momentary button, toggle switch, LED, LED bank, direct seven-segment display (a–g plus DP), or UART terminal from the library.
2. Select a device to rename it, set polarity/initial state, and map each channel to a structurally discovered RTL port/bit. Drag its heading or edit X/Y to arrange it. Duplicate and Remove work while stopped; duplicate input connections are cleared to avoid driver conflicts.
3. Map the optional scalar clock and set its frequency. **Compile & Start** compiles real RTL with Verilator and starts paused. **Run** advances bounded batches; **Pause** finishes the current batch (at most 256 cycles). **Step** advances one full clock cycle, or one time quantum with no clock.
4. **Reset to initial state** recreates the model at time zero, restores configured switches and released buttons, sets UART RX idle high, and clears terminal state. It does not synthesize a reset signal or guarantee a particular value for uninitialized user registers. **Stop** destroys the session. Source/top/configuration changes require recompilation.
5. Save with Cmd/Ctrl+S or the existing autosave. Devices, connections, layout, labels, polarity, switch initial states, clock settings, and UART preferences live in `allora-project.json` under `peripheralWorkbench`. Existing `simulation` mappings are migrated on first use without changing their original data. A legacy reset mapping becomes a momentary button.

UART is **8N1, idle high**; TX maps the FPGA output and RX the FPGA input. Text uses UTF-8, hex accepts byte pairs, and line endings are selectable. Send while paused queues bytes until Run/Step; sending while stopped is disabled. Clear clears received data/framing diagnostics. The queue holds up to 4096 bytes and receive history retains the newest 8192 bytes. Use a simulation frequency at least 16× baud. UART RX transitions are placed at rounded cycle boundaries; every half-cycle in every batch is decoded, not just UI refresh snapshots. LED/display transition counts also process the complete trace. The display drawing shows the latest direct signal state.

Yosys, Verilator, and a working C++ toolchain are required. V1 supports synthesizable Verilog/SystemVerilog input/output ports up to 64 bits, direct segment signals, and one optional scalar clock. VHDL, `inout`, multiplexed displays, serial flow control/parity variants, and physical electrical behavior are not supported by this workspace. Missing tools, failed compilation, invalid mappings, and simulator termination surface diagnostics. Simulation is deterministic cycle stepping, not wall-clock emulation.

Try [`examples/peripheral-workbench`](examples/peripheral-workbench) for UART echo plus direct devices, [`examples/peripheral-vector-polarity`](examples/peripheral-vector-polarity) for exact high vector bits, or the existing virtual counter for mapping migration.

Validation (from the repository root):

```sh
npm --prefix allora-fpga run build
npm --prefix allora-fpga run lint
cargo test --manifest-path allora-fpga/src-tauri/Cargo.toml --no-fail-fast
```

The `workbench_` Rust integration tests require actual Yosys and Verilator; missing tools fail instead of silently skipping. They compile the production C++ harness and run the production TypeScript peripheral models against real RTL, covering I/O, vector polarity, direct display patterns, UART echo across batches, lifecycle, initial states, metadata save/reopen/migration, invalid mappings, conflicting drivers, and exact 64-bit values. `allora-fpga/tests/workbench-ui.html` is a UI-only development fixture; it deliberately has no mock simulator and reports missing Tauri when viewed in a browser.
