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
- Icarus Verilog testbench simulation with VCD waveform inspection.
- A local-first GitHub publishing workflow with explicit commits, repository creation/selection, safe `origin` setup, first push, and later commit/push status. GitHub sign-in is optional and never part of project creation.
- Settings → AI Integration detects and connects locally installed OpenAI Codex and Claude Code CLIs through each provider's own login flow. Codex CLI sign-in and a live Codex request have been verified on a development Mac; Claude Code support is implemented but has not had a live account test.
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
- Continue Project appears only when a recent project exists. It shows the board and date on one line, the time on a second line, and explicit Simulate and Build actions because projects do not yet persist their last execution target.
- The Allora tile opens a compact product panel with the app version, documentation, implemented shortcuts, supported-board count, and recent-project information.
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
- `GITHUB_INTEGRATION.md` — OAuth, credential storage, Git/API/CLI boundaries, and publishing safety model.

## Contributing

Keep simulation and physical hardware as equal targets, prefer reusable typed abstractions, preserve existing workflows, and never substitute JavaScript behavior for the user's RTL. Add a dated entry to `CONTINUATION.md` with the change, validation performed, known limitations, and next useful step.

## License

MIT
