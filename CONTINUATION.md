# Allora FPGA — Continuation

Updated 2026-10-22. This is a short engineering handoff; `CONTEXT.md` is the detailed current architecture guide, and focused feature behavior and limits live in the docs linked below.

## Current app state

- Allora is a local-first React/TypeScript and Tauri/Rust FPGA workspace. The welcome flow offers physical-board projects, board-free simulation projects, project opening/recent projects, and dedicated design tools.
- Physical and board-free projects use one dashboard and dock. Main workspaces are Editor, Testbench, Synthesis, Pin Mapping, Bitstream, Program, Virtual FPGA, Peripheral Workbench, Memory Asset Studio, Register Builder, and AI Design Studio. Health is inside Bitstream; Serial Monitor is inside Program.
- Project folders and `allora-project.json` are canonical. Editor changes autosave; generated assets use guarded, feature-owned writes. Physical build operations are enabled according to board and toolchain support.
- Virtual FPGA and Peripheral Workbench run Verilog/SystemVerilog with the native Verilator engine. Testbench uses Icarus/VCD. Synthesis, timing, and bitstream generation use configured Yosys/nextpnr flows. Programming and serial tools are available where configured.
- Pin Mapping supports verified board resources and constraint export. The welcome mapper can import bounded output declarations from Verilog/SystemVerilog/VHDL or a Vivado `.xpr` for manual assignment: [PIN_MAPPER_IMPORT.md](docs/PIN_MAPPER_IMPORT.md).
- Memory Asset Studio generates project-owned memory data and optional ROM wrappers; Register Builder creates register maps and reviewed wrappers. Board Migration V1 analyzes supported physical-board projects and creates a separate copy: [BOARD_MIGRATION.md](docs/BOARD_MIGRATION.md).
- AI Design Studio uses the installed Codex app-server with Allora's scoped MCP tools for project edits and FPGA jobs. It includes project-aware history, change review, diagnostics, and guarded programming. GitHub publishing is explicit and requires the project owner's public OAuth client ID.
- Ice/Black Ice styling, shared controls, reduced-motion behavior, popup behavior, and workspace layouts are documented in the [UI guide](allora-fpga/src/components/ui/README.md) and [design audit](docs/DESIGN_SYSTEM_AUDIT.md).

Physical-board project setup now has equal-width Details, Structure, and Toolchain Wizard panels. The shared wizard also appears in Health, detects board-specific executables through `detect_toolchain_tools` without running them, and links installation instructions. Board data remains expandable; the setup board diagram is removed.

## Current limits

- Interactive simulation supports Verilog/SystemVerilog top-level ports up to 64 bits. VHDL interactive simulation and top-level `inout` are unsupported.
- Board catalog presence or preflight does not guarantee a build flow or physical support. USB discovery does not prove the exact board/revision; physical programming and electrical behavior still need release smoke testing.
- Board Migration V1 covers a bounded Verilog/SystemVerilog subset and verified build-supported physical destinations. Unknown constraints, clock intent, device-specific logic, and moving a board-free design to hardware need manual review/mapping.
- Generated testbenches are scaffolds. Resource Usage sampling is macOS-only. Embedded chat uses Codex; Claude Code support is for installation/authentication status.
- Live GitHub sign-in and push have not been verified without the configured OAuth client ID.

## Recent implementation state — 2026-10-20/21

- Board Migration Assistant V1 shipped with verified resource remapping, review/takeover, transactional project copies, and separate simulation/synthesis/build/timing validation.
- Landing layout preference is saved per display; compact layouts still center on tall viewports.
- Reopening a project with saved AI messages restores its latest project conversation. The welcome chat still starts fresh on app launch.
- Shared field/dropdown styling was standardized. Chat completion uses a gradient dock outline and an in-panel swipe; the Ultra reasoning control uses a reduced-motion-aware colored swipe.

## Verification and next work

The latest full-suite results recorded for the app are 241 frontend tests and 104 native tests passed, with four unrelated native tests ignored; lint and production build passed. Migration tests exercised Icarus, Yosys, and NextPNR, including a passing 12 MHz timing case. Packaged folder-picker navigation and physical boards were not verified. These results were not rerun for this handoff edit. `git diff --check` passed for this edit; no app tests/build were run.

Next useful work: run a native release smoke for project opening/folder selection and a supported physical board, then update `README.md`'s old split Simulate/Build welcome description. For syntax and feature-specific limitations, see [Synthesis Explorer](docs/SYNTHESIS_EXPLORER.md) and the Pin Mapper and Board Migration guides above.
