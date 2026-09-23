# Allora FPGA — Project Context

This document is a medium-detail orientation guide for contributors and future development sessions. It describes the current product, architecture, important data flows, and near-term direction. `README.md` remains the user-facing overview; `CONTINUATION.md` is the chronological engineering handoff.

## Product purpose

Allora FPGA is a local-first desktop development environment for open-source FPGA workflows. It is intended to keep editing, simulation, synthesis, place-and-route, bitstream generation, programming, and hardware inspection in one application.

The product has two equal execution paths:

- **Simulate / Virtual FPGA** runs Verilog or SystemVerilog designs through Verilator and presents interactive virtual inputs, outputs, signals, and optional waveform capture.
- **Build / Physical FPGA** targets a selected board and provides source editing, board information, synthesis diagrams, pin mapping, timing analysis, bitstream generation, programming, serial monitoring, and project health.

Both paths operate on disk-backed Allora projects. A project can remember its most recent execution target, but virtual mappings and physical board constraints remain separate concerns.

## Repository layout

- `allora-fpga/` — React/TypeScript frontend and Tauri/Rust desktop application.
- `allora-fpga/src/` — application UI, project state, board data, editor, and frontend service wrappers.
- `allora-fpga/src-tauri/` — native filesystem access, tool execution, build/simulation processes, programming, serial I/O, and secondary viewer windows.
- `allora-website/` — the separate project website.
- `examples/` — example projects that can be opened by the desktop app.
- `README.md` — public product and development overview.
- `CONTINUATION.md` — newest-first implementation log and handoff notes.
- `CONTEXT.md` — this architectural and product context document.

## Technology stack

| Area                              | Technology                                |
| --------------------------------- | ----------------------------------------- |
| Desktop shell and native commands | Tauri 2 + Rust                            |
| Main interface                    | React 19 + TypeScript + Vite              |
| Code editor                       | Monaco                                    |
| Interactive RTL execution         | Verilator                                 |
| Testbench simulation              | Icarus Verilog (`iverilog` and `vvp`)     |
| Synthesis                         | Yosys                                     |
| Place and route                   | nextpnr                                   |
| FPGA packing/programming          | Board-family-specific open-source tools   |
| Waveforms                         | VCD parsing and dedicated viewer surfaces |
| Persistent lightweight UI state   | Browser `localStorage`                    |
| Project source of truth           | Files in the selected project directory   |

## Application flow

`src/App.tsx` owns the top-level application stage:

1. `board-select` shows the Simulate/Build welcome experience and the physical board catalog.
2. `simulation-setup` creates a board-agnostic simulation project.
3. `project-setup` creates a hardware project for a selected board.
4. `dashboard` opens the main editing and execution workspace.

The dashboard maintains separate Simulate and Build navigation sets. Visited dashboard sections remain mounted so generated diagrams, bitstreams, logs, simulation sessions, and other transient results are not discarded when the user changes sections.

The app can also open a lightweight secondary viewer window. `src/main.tsx` selects `ViewerApp` when the URL contains a viewer query parameter; otherwise it mounts the primary application.

## Project model and persistence

Every disk-backed project contains an `allora-project.json` metadata file plus its HDL and optional constraints, simulation, and generated files. Typical hardware projects use this shape:

```text
project-root/
  src/
    top.v
  constraints/
    constraints.lpf
  sim/                  # optional
    top_tb.v
  build/                # generated and normally ignored by Git
  allora-project.json
  .gitignore            # optional when local Git is initialized
```

The project directory is the source of truth for file contents. `src/data/projects.ts` stores only lightweight recent-project information in `localStorage`, including the path, board, selected files, active file, top-level file, timestamps, and last execution target. Disk-backed file contents are deliberately removed from the persisted browser record to avoid storage limits and stale copies.

`allora-project.json` records the project name, board or virtual target, language, top module, selected starter, and relevant simulation metadata. New hardware projects also record the selected source filename, optional testbench name, and whether local Git initialization was requested.

The editor autosaves unsaved work after 30 seconds and supports Cmd+S/Ctrl+S. File contents are written through Tauri commands rather than browser filesystem APIs.

## Hardware project setup

The current hardware setup page has three columns:

- **Project Details** — project name, HDL language, parent directory, derived top/source/constraints summary, and the Create Project action.
- **Project Structure** — compact starting-point dropdown, editable top module, editable source filename, optional testbench creation, optional local Git initialization, and a live list of files that will be created.
- **Board Summary** — a moderately enlarged board preview, resources, capabilities, device/package information, constraints format, toolchain, and programmer.

The default starting point is **Empty Project**. Other board-compatible starter generators remain available from the dropdown.

Top-module and source-file defaults follow the project name until the user customizes them. Changing the HDL language updates the expected source extension. The setup page validates HDL identifiers and source filenames before enabling project creation.

When **Create testbench** is enabled, the app creates `sim/<top_module>_tb.<extension>`. The generated file is currently a syntactically valid scaffold with waveform setup for Verilog/SystemVerilog and a TODO for DUT signals/instantiation. It does not yet generate a fully connected testbench for every starter template.

When **Initialize local Git repository** is enabled:

- the native backend verifies that the `git` executable is available;
- it runs `git init` in the newly created project directory;
- it creates a project `.gitignore` covering build outputs, bitstreams, simulation waveforms, and common editor/OS files;
- it does not create a commit, add a remote, authenticate to GitHub, or push anything.

If Git is missing, project creation reports a clear error before creating the workspace.

## Board and template data

Board definitions live under `src/data/boards.ts` and `src/data/boards/`. A `BoardDefinition` identifies the FPGA family, device, package, constraints format, toolchain commands, clocks, pins, LEDs, buttons, and optional programmer information.

`src/data/boardCapabilities.ts` converts a board definition into user-facing support states for pin mapping, synthesis diagrams, bitstreams, and programming. Capabilities reflect the actual wired backend rather than merely whether a board appears in the catalog.

Hardware starter generators live in `src/data/templates.ts`. They produce source text and board-pin mappings, allowing the constraints file to be generated with matching top-level port names. Templates can disable themselves when the selected board lacks required resources or when the language is unsupported.

## Build and simulation services

Frontend calls into native commands through `src/lib/tauri.ts`. Browser preview is useful for interface QA, but filesystem operations, tool execution, programming, serial communication, and real simulation require the Tauri runtime.

The main Rust command layer is `src-tauri/src/lib.rs`. It currently handles:

- project creation, reading, writing, renaming, and deletion;
- local Git initialization during project creation;
- board and programmer detection;
- Yosys synthesis and netlist-diagram generation;
- nextpnr place-and-route, timing reports, and bitstream generation;
- family-specific packing and programming commands;
- Icarus testbench execution and VCD discovery;
- HDL linting;
- serial-port enumeration and monitor sessions;
- secondary synthesis/waveform viewer windows.

Persistent interactive Virtual FPGA sessions are implemented in `src-tauri/src/virtual_fpga.rs`. The backend discovers top-level ports with Yosys, generates a Verilator harness, compiles the model, maintains the native process, exchanges input/output values, advances simulated time, and optionally records traces.

External tools are resolved from the environment and common install locations. A successful frontend build does not prove that a particular FPGA toolchain or programmer is installed on the user's machine.

## Frontend organization

- `src/pages/welcome/` — welcome shell, Simulate/Build destinations, board selection helpers, pin browser, and variant selection.
- `src/pages/ProjectSetup.tsx` — physical-board project creation.
- `src/pages/SimulationProjectSetup.tsx` — board-agnostic simulation project creation.
- `src/pages/Dashboard.tsx` — main workspace coordinator and execution-target boundary.
- `src/pages/dashboard/` — editor, Virtual FPGA, synthesis, testbench, pin mapping, timing, bitstream, programming, serial, and health sections.
- `src/hooks/` — active tabs, file management, autosave, and shared helpers.
- `src/lib/` — Tauri bridge, disk workspace construction, waveform parsing, build history, viewer windows, and Virtual FPGA metadata.
- `src/styles/` — feature-level styles and Ice/Black Ice theme overrides.

New native behavior should be exposed as a typed frontend wrapper rather than calling Tauri directly from many components. New board-specific behavior should generally be expressed through board definitions/capabilities instead of scattered component conditionals.

## Development and validation

Run the desktop app:

```bash
cd allora-fpga
npm install
npm run tauri dev
```

Common validation:

```bash
cd allora-fpga
npm run build
npm run lint
npx prettier --check src

cd src-tauri
cargo check
cargo test
cargo fmt --check
```

The production build currently emits a known bundle-size advisory for large JavaScript chunks. It is not a build failure.

For UI changes, validate both Ice and Black Ice, the native WebView when native-only behavior is involved, keyboard focus, reduced-motion behavior where applicable, and constrained desktop heights. Browser preview cannot validate Tauri commands.

## Current boundaries and known gaps

- Interactive Virtual FPGA supports Verilog/SystemVerilog top-level signals up to 64 bits; VHDL interactive execution and top-level `inout` remain unsupported.
- Physical board support varies by family. Presence in the catalog does not guarantee that synthesis, bitstream generation, and programming are all wired.
- Generated testbenches are scaffolds, not template-aware complete verification environments.
- GitHub publishing requires a project-owner-supplied OAuth client ID and the system `git` executable. `gh` remains optional.
- GitHub V1 intentionally does not fetch, pull, merge, rebase, resolve divergence, manage collaborators, or work with issues and pull requests.
- Project directories remain the canonical data store; Git must not replace or bypass the existing Tauri file-save path.

## GitHub services

The dashboard now has one **Publish to GitHub** entry point. GitHub remains optional: local project creation, editing, simulation, and hardware builds do not require an account or a network connection.

Allora is treated as a public native OAuth client. It uses GitHub's OAuth Device Flow, displays the short-lived one-time code in the publish dialog, and polls only at GitHub's required interval. The project owner must enable Device Flow on the OAuth App and compile the public client ID through `ALLORA_GITHUB_CLIENT_ID`; no client secret belongs in the desktop binary. Until that client ID exists, the UI explains the exact missing configuration and does not attempt authentication.

OAuth tokens remain entirely in Rust and are stored through the operating system credential vault (macOS Keychain, Windows Credential Manager, or Linux Secret Service). They are never returned to the WebView or stored in project files, `localStorage`, settings JSON, logs, remote URLs, or Git command arguments. Account status validates the token with GitHub and converts expired or revoked credentials into a signed-out state with reauthentication guidance.

Responsibilities are intentionally separated:

- `src-tauri/src/github.rs` uses the direct GitHub REST API for authorization, user validation, owned-repository discovery, and repository creation.
- The same native service invokes the system `git` executable for repository initialization, status, staging, commits, local identity, remotes, and pushes. Structured data and error codes cross the Tauri boundary; the UI does not parse raw command output.
- GitHub CLI (`gh`) is detected and displayed only as optional diagnostic information in V1. It is not required, invoked, or used as a second credential store.
- Authenticated HTTPS pushes use a permissions-restricted temporary askpass helper. The token is read from the OS vault and passed only through the child process environment, never through a command argument.

The workflow separates sign-in, local initialization, staging/commit, repository creation or selection, `origin` connection, and push into explicit user actions. New repositories default to private. Allora never replaces a mismatched existing `origin`, fetches/pulls/merges without instruction, or uses force push. A rejected push is surfaced for manual resolution. Ahead/behind status is based on existing local upstream refs and does not imply that Allora silently contacted the network.

`src/lib/github.ts` is the typed frontend service boundary and `src/components/GitHubPublishDialog.tsx` owns the progressive-disclosure UI. Full setup, security decisions, responsibility boundaries, and primary-source links are documented in `GITHUB_INTEGRATION.md`.

## Working principles

- Keep Simulate and Build as equal first-class paths.
- Keep the application local-first and make network actions explicit.
- Do not invent configurable tool choices when the board has only one supported synthesis/place-and-route path.
- Only expose project-setup controls that alter generated output or project behavior.
- Preserve disk files as the source of truth and use typed Tauri commands for native operations.
- Avoid hidden Git commits, remote creation, pushes, or authentication side effects.
- Preserve unrelated working-tree changes.
- Add a newest-first entry to `CONTINUATION.md` after meaningful codebase changes, including validation, limitations, and the next useful step.
