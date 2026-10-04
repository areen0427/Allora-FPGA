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
- Welcome-screen chat streams installed Codex responses and exposes Allora project, pin, simulation, build, and confirmed programming operations through a local MCP server. Settings → AI Integration detects and connects locally installed OpenAI Codex and Claude Code CLIs through each provider's own login flow. Embedded chat uses Codex; Claude Code retains installation/login support.
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

- All persistent controls form one compact, right-aligned column with a shared width and edge: Allora, Chat, Simulate, Build, Pin Mapper, and the conditional Continue Project card.
- Simulate and Build are semantic buttons with matching dimensions, frosted materials, keyboard focus, and restrained hover depth. Their labels and supporting text remain accessible HTML rather than being baked into the artwork.
- Pin Mapping is a secondary action attached to Build instead of a competing global navigation item.
- Continue Project appears only when a recent project exists. It shows the board and date on one line and the time on a second line. It resumes the last execution target when one is saved, or offers Simulate and Build choices for older projects without one.
- The Allora tile opens a compact product panel with the app version, documentation, implemented shortcuts, supported-board count, and recent-project information.
- The product panel closes on an outside click or Escape.
- The left rail provides Home and Chat, with Settings at the bottom.
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

## AI chat and integration

Allora checks for the latest stable Codex CLI once per app launch in the
background on macOS and Linux, then checks the account and preloads its model
catalog. Build with AI reuses this prepared state rather than starting a new
check. Opening chat during startup joins the same in-flight preparation.
The official installer stages a private
runtime in Allora's cache; your global CLI, shell profiles, and account state
are unchanged. The new executable is selected only after its version check
succeeds. Offline or failed updates keep the last verified runtime and show a
warning in AI Integration. Running chats keep the executable they started with.

For local development, run `npm run tauri dev` from `allora-fpga` after
`npm install`. The project's pinned CLI (0.160.0) is an offline fallback when
no private runtime has been installed. GPT-6.1 Sol was added to the CLI catalog
in 0.159.1; older CLIs can omit it even when the ChatGPT app offers it.

`ALLORA_CODEX_PATH` selects a CLI explicitly for status, login, model discovery,
and chat, bypassing automatic updates. An invalid override does not silently
fall back to another CLI. Global installations are a final fallback. Windows
currently uses the installed CLI and manual updates. AI Integration shows
update guidance for pre-0.159.1 releases. For an npm installation, run
`npm install -g @openai/codex@latest`, choose Check Again, and start a new chat.

Open **Settings → AI Integration** to check the Codex or Claude Code CLI, view the detected version and executable path, and follow installation guidance if a CLI is missing. **Check Again** reruns detection without restarting Allora. When a CLI is installed, **Connect** starts that provider's login command in macOS Terminal; the provider handles the browser sign-in and stores its own credentials. Allora neither requests nor stores an OpenAI or Anthropic password, API key, or token.

An existing CLI login can appear as **Connected** immediately. The settings check uses `codex login status` or `claude auth status --json`; it does not make a live model request. The Codex desktop app's bundled runtime is not treated as a separate CLI installation. Claude Code retains installation/login status support; embedded chat currently uses Codex.

Open **Chat** on the welcome screen, choose a workspace folder, and describe what you want to build. For example: "Create a one-second LED blinker on an iCEBreaker, write a testbench, map the verified clock and LED pins, simulate it, and build the bitstream." The desktop app launches the installed Codex CLI's `app-server` using the existing CLI login. The model popup shows provider descriptions and context windows; its reasoning slider uses each model’s reported options. Context sizes come from Codex’s local model metadata and are marked Not reported when unavailable. Responses stream into chat, tool calls show their inputs and results, and **Stop** interrupts the turn and cancels running FPGA jobs. Conversations are saved on this device and resume their Codex threads. Open a generated project from its chat card to inspect files and results in the existing Allora workspace.

Allora supplies its board catalog and project operations through a local stdio MCP server, launched in the same executable's `--allora-mcp` mode. Its configuration is scoped to the embedded session; it does not register a server in the user's global Codex configuration. Chat tools create projects, inspect and update files, assign verified pins, check installed tools/hardware, lint, simulate, build, and retrieve/cancel jobs. File operations stay within the selected folder, edits check expected revisions, and build artifacts are tied to source revisions and board definitions. The initial chat lives on the welcome screen: finish or stop a turn before opening its project in the editor.

Programming requires an in-chat approval for the specific target and artifact. Allora rejects stale or modified artifacts. Hardware discovery can identify possible boards, but shared USB identities do not prove the exact FPGA board or revision; confirm the attached target. A successful programmer command reports the upload result, not physical LED behavior. The chat supports the same Verilog/SystemVerilog, Icarus, Yosys/NextPNR iCE40/ECP5 flows as the app; other catalog boards may provide context or pin data without a working build/program flow. Missing toolchains, login failures, unavailable MCP tools, and build failures surface in chat. Chat in a plain web browser shows a desktop-required state and does not fabricate responses.

Implementation references: [Codex app-server](https://learn.chatgpt.com/docs/app-server) and [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Run `npm run test:ai-mcp` from `allora-fpga` to exercise the shipped stdio server with a real iCEBreaker design: revision-checked edits, pin validation, lint, finite simulation, a timing-checked bitstream, declined programming, and stale-artifact rejection. It requires the actual FPGA toolchain and never authorizes hardware programming. A separate ignored Rust smoke test (`ai_chat::tests::live_codex_mcp_turn`) exercises a logged-in installed Codex; `ALLORA_CHAT_SMOKE_EXPECT_BUILD=1` requires successful writes, simulation, and a real build artifact.

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

Open **Peripheral Workbench** from the main project navigation in either Build or Simulate mode. The welcome-screen entry opens the existing project creation/selection flow. Physical-board projects keep their board, HDL, top module, build settings, and pin constraints. **Register Builder V1** is also available from the welcome screen and shared project navigation. **Memory Asset Studio** is available from the welcome screen and the editor rail.

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


## Register Builder V1

Open **Register Builder** from the existing welcome entry or the design-tools rail in either project mode. Create a simulation/board project or open an existing project. Add registers, duplicate/reorder them, edit byte offsets, and add named bit fields. The bit diagram shows high-to-low positions, named fields, unfielded bits, and overlaps. Validation runs while editing and disables generation for conflicting addresses, misalignment, out-of-range or overlapping fields, duplicate names/IDs, invalid identifiers/access modes or testbench-style module names, oversized resets, and generated-signal/C-constant collisions.

One map belongs to each project. Map edits save immediately through the same guarded native transaction used by Memory Asset Studio, including semantically invalid drafts that can be reopened and repaired. **Save map** retries a failed save. Wait for the saved status before exiting the app. Closing and reopening a project restores register/field definitions, ordering, descriptions, configuration, and generated-file ownership from `Register_Map/register-builder.json`.

**Generate files** writes these normal project files (using the module name selected in the builder):

```text
Register_Map/
  register-builder.json          # versioned editable-map manifest and output hashes
  <name>.sv                     # synthesizable register bank
  <name>.h                      # firmware offsets, widths, masks, shifts and resets
  <name>.json                    # software-facing map definition
  <name>_instantiation.txt       # documented manual wiring snippet
  <name>_top.sv                  # optional reviewed integration wrapper
```

The explorer expands `Register_Map/` by default; output buttons open files in the normal editor. Generated files are read-only there and excluded from editor autosave. Regeneration checks SHA-256 ownership and expected disk contents before committing files and the manifest together. It refuses unowned collisions and externally edited outputs, preserves unrelated files, recreates missing owned outputs, and removes obsolete outputs only when their contents still match recorded ownership. For edited output conflicts, preserve/move the edited file before regeneration; for an unowned filename collision, choose another module name. Renaming a map regenerates its filenames.

### Native interface and access behavior

| Signal | Meaning |
| --- | --- |
| `clk` | Rising-edge clock |
| `rst` / `rst_n` | Selected synchronous active-high / active-low reset |
| `addr` | Byte offset, 1–32 address bits |
| `wr_data` / `rd_data` | 8, 16, 32, or 64-bit data bus |
| `wr_en` | Full-word write on a rising edge |
| `rd_en` | Enables combinational read; disabled or unmapped reads return zero |

Registers can be 1 bit through the data-bus width; every address reserves a full data-bus word and must be word-aligned. Field access/reset overrides register defaults. Unfielded bits inherit those defaults. Decimal, `0x` hexadecimal, and `0b` binary values are supported with exact 64-bit arithmetic.

- **RW** stores software writes and exposes the value to hardware.
- **RO** reads a live hardware input and ignores software writes. Its configured reset is a firmware constant; the surrounding hardware owns initialization of this input.
- **WO** stores writes and exposes their values to hardware; software reads return zero for those bits. Each register also exposes an accepted-write strobe, sampled on `clk`, for command consumption.
- **W1C** clears stored bits written as one and exposes a hardware-set input. Hardware set wins simultaneous software clear; reset has priority over both.

Every register has a complete hardware value output. Named stored fields have individual value outputs; RO fields/registers have input signals; W1C segments have set inputs. The generated C header documents access modes and includes `UINT64_C` constants, avoiding truncated 64-bit masks.

### Integration

**Manual:** Generate files and expand **Manual instantiation snippet**. Copy its declarations and instance into your design module, connecting every input explicitly. This preserves your selected top and handwritten RTL. Generated HDL already participates in the shared Icarus, Verilator/Peripheral Workbench, synthesis-diagram, and bitstream source lists.

**Assisted:** Choose **Connect to Top Level**. Allora uses the existing Yosys structural port discovery on the actual project sources. Select clock/reset ports and matching-width hardware connections; defaults expose separate inputs rather than guessing. Review the complete generated wrapper before choosing **Generate wrapper & use as top level**. It instantiates both the original design and bank, preserves the original HDL, updates project top selection plus `allora-project.json` top/source metadata, and leaves design-specific bus/set/status inputs visible as `rb_*` ports. Regeneration rechecks the original top's ports. **Use original top for manual integration** restores the original design selection; ordinary regeneration does not change the selected top.

A bus master or your own protocol adapter must drive address/data/enables. Review physical pin constraints and virtual/peripheral mappings for new wrapper ports before building or running. V1 does not synthesize a bus master, CPU, AXI/APB/Wishbone adapter, byte strobes, or a handshake. Assisted wrappers support ordinary descending, zero-based Verilog/SystemVerilog input/output ports up to 64 bits; VHDL, inout, ascending/nonzero-index ports, unavailable tools, or ambiguous/unsupported port structures use manual integration. The builder supports at most 256 registers and 64 fields per register.

Try [`examples/register-builder`](examples/register-builder), containing all four access modes, a register-enabled hardware counter, a reviewed wrapper, and an assertion-based testbench. In Allora, open **Testbench → Run Simulation** to inspect its real waveforms.

Validation from `allora-fpga`:

```sh
node --test tests/register-builder.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml --lib register_builder
npm run build
npm run lint
```

Tests exercise map validation, exact resets, C compilation, persistence/conflict handling, deterministic regeneration, actual Icarus access-mode simulation, Yosys synthesis, Verilator lint, and production native synthesis/testbench/interactive simulation services. Native UI checks covered Ice/Black Ice, conflict diagnostics, reviewed wrapper generation, generated-file editor access, waveform simulation, and project close/reopen. Physical programming and board-level timing for a register design have not been verified.
