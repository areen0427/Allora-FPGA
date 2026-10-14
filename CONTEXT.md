# Allora FPGA — Project Context

This is the current product and architecture guide for contributors and future development sessions. Keep it about present behavior, not abandoned UI experiments or a chronological change log. `README.md` is the user-facing overview; `CONTINUATION.md` records engineering handoffs. Unless otherwise noted, `src/` and `src-tauri/` paths below are relative to `allora-fpga/`.

## Product and navigation

Allora FPGA is a local-first Tauri desktop environment for editing HDL, testbench and interactive simulation, synthesis, pin mapping, bitstream generation, programming, and hardware inspection.

**Build and simulation share one workspace.** There are no separate navigation modes or Build/Simulate sidebar switches. Physical-board and board-free projects use the same dock; board capabilities still determine which hardware operations are supported. Virtual simulation mappings remain separate from physical constraints. Existing `projectKind` and `lastExecutionTarget` fields remain compatible with saved projects and are not navigation gates.

The welcome screen is organized as:

- **Workspace** — one **Build** entry, followed by Continue Project (when available) and Open Project tiles of equal size, separated by equal gaps within the existing panel. Open Project uses the existing project-folder picker. Its landing page offers the physical-board catalog, a new board-free project action, opening a project, and recent projects. It has no AI entry or Launch Defaults panel.
- **Design Tools** — **AI Design Studio** first, followed by Peripheral Workbench, Memory Asset Studio, Register Builder, and Pin Mapper. AI Design Studio uses the shared welcome handoff animation and chat arrival animation, honoring Reduce Motion. The first chat opened after each app launch starts fresh; in-app returns preserve the active conversation. It never selects a recent project implicitly. The other tools retain their project-selection or pin-browser routes.

AI Design Studio uses the supplied SVG through `src/components/AiDesignStudioIcon.tsx`; the welcome entry, dock action, and chat title share that component. Welcome tool rows reserve the same leading icon width so their labels align.

`WorkspaceDock` is shared by project workspaces and welcome chat. In projectless chat, dock destinations open their welcome landing pages (Build for build-related sections, dedicated landings for design tools and Pin Mapping), remembering the requested workspace for explicit project creation/opening. Back returns to the same live conversation; Home returns to Welcome. Within a project, dock, chat, tool, and editor destinations share workspace history: Back pops the previous workspace, falling back to project setup only when workspace history is empty. Duplicate destinations and legacy aliases do not add history entries. A macOS horizontal trackpad back swipe uses a continuous frame loop for a rightward nudge up to 40px, with a theme-aware glass chevron at the left edge, finishing the nudge before navigation, then invokes the same Back action and fades in the destination at rest over 300ms. Slow gestures tolerate brief input pauses and diagonal noise without resetting progress. Allora’s Reduce Motion setting and the system reduced-motion preference disable both effects. Gesture tracking survives route changes to suppress repeated navigation from momentum, while dialogs, editors/canvases, and gestures owned by horizontally scrolling content are excluded. Its main order is Editor, Testbench, Synthesis, Pin Mapping, Bitstream, Program, then Peripheral Workbench, Memory Asset Studio, Register Builder, and **Virtual**. Virtual is directly below Register Builder. The lower actions include AI Design Studio, Resource Usage, Settings, and Back. Health and Serial do not have separate dock buttons.

| Workspace | Current organization |
| --- | --- |
| Editor | Shared project explorer, open file tabs, breadcrumbs, autosave status, and Monaco code canvas. |
| Testbench | Testbench selection/actions above an open waveform canvas; framed Setup, Files, and Simulator Log panels on the right. |
| Synthesis | Top-level selection/actions, design report, and a framed right inspector. |
| Pin Mapping | Simple/Advanced modes; Advanced has Assignments, Resources, Board, and Constraints views plus assignment/validation inspectors. |
| Bitstream | **Build Log / Health / Bitstream Preview** tabs. Health is the default; clicking Generate Bitstream switches to Build Log. Build Preflight is a scrollable section in the right column, alongside build details and pin mapping. |
| Program | **Program / Serial Monitor** tabs. Serial has a compact embedded layout; switching these tabs keeps it mounted so the connection is preserved. |
| Virtual | Interactive Verilator workspace, reachable without changing a project mode. |
| AI Design Studio | Codex conversation, project access, and compact recent-chat controls. Within a project it retains the shared file explorer and dock. |

Legacy `health` and `serial` destinations resolve to Bitstream and Programming. Explicit tool launches select the requested section; ordinary workspace synchronization preserves the current page, including chat. Stateful sections that use `KeepAliveSection` preserve their results when hidden; do not assume every section remains mounted.

## Shared design system and interaction rules

Use the shared architecture instead of adding page-specific control styling. The detailed reference is [the UI guide](allora-fpga/src/components/ui/README.md); the [consistency audit](docs/DESIGN_SYSTEM_AUDIT.md) records intentional exceptions and regression coverage.

- `src/styles/tokens.css` owns theme-aware colors, surfaces, radii, sizing, and motion. `controls.css` owns control variants, `button-glass.css` supplies glass material, and `workspace.css` owns shared workspace geometry. `App.css` imports these layers.
- Ice and Black Ice use the same component behavior. Neutral text/icons use `--ui-text`, `--ui-text-muted`, or `--ui-text-soft`; accents use `--ui-accent-text`. Black Ice text is near-white and its accent text is pale blue. SVGs inherit `currentColor`. Fixed colors belong only to meaningful code/data visualization or physical artwork, not ordinary UI labels. The old style-substring theme shim is removed.
- `WorkspaceTitle` supplies the canonical page name and dock icon. Standard pages use a 20px content inset, 24px title/icon slot, and **Testbench's 22px title-to-first-section gap**. Do not add another top margin below the title. Introductory page subtitles are omitted; useful empty-state instructions remain. Section headings are 16px and subheadings 14px.
- Standard right columns use the 205px Synthesis reference width through `ui-workspace-columns` / `ui-workspace-split` and `ui-workspace-aside`. Text and fields must wrap or shrink within it. Narrow layouts stack supporting panels below the content.
- Standard pages use an open, borderless canvas with a barely visible theme-aware dot grid. Supporting right panels keep their frames. **Peripheral Workbench and Register Builder retain their framed tool layouts; Memory Asset Studio retains the open workspace layout.** Preserve real reading/data surfaces, interactive controls, dialogs, and popovers when removing structural frames.
- `ui-button-group` containers have no outer/shared border. `ui-compact-button-group` makes nearby controls transparent at rest, separates them with small vertical dividers, and restores glass borders/animation on hover. `useAutomaticCompactGroups` applies this behavior to at least three consecutive visible sibling controls in a flex/grid row with gaps at most 12px; pairs use an explicit group. It reevaluates layout, separates wrapped rows, and excludes dock, file-tree, card, and physical-switch controls.
- `ui-selection-group` retains the selected button's theme-aware liquid-glass border. Files/Hierarchy and Pin Mapping's Simple/Advanced and Assignments/Resources/Board/Constraints use this variant. `ui-button-group-flush-start` aligns the first text label to the content edge without shrinking its hit area.
- `ui-action-button` is for committing actions such as Generate, Program, Done, Run Synthesis, and Run Simulation. It keeps a blue border, transparent fill, and shared glass hover animation/subtle lift. Use the same variant inside and outside groups.
- `ui-icon-button` provides a 34px target. Collapse Explorer, Add File, and Import File use `ui-icon-button-hover` for hover-only borders; preserve enough room so the icons and glass edges do not clip. Ordinary text hover controls use `ui-hover-button`.
- Dock icons are borderless in every state, use a shared 22px SVG slot, and have restrained hover magnification (1.15 maximum). Do not restore individual icon borders. Memory Asset Studio uses a square icon footprint like the other navigation icons.
- Passive counters use `ui-metric`: text with short separators, not bordered buttons. Passive validation messages are plain text; actionable messages can use `ui-text-action` without a glass border. Hierarchy rows have no non-clickable background hover target; the module-name control owns its hover border and padding.
- File right-click menus use the compact `ui-context-menu` / `ui-menu-item` variants: 180px menu width, 30px minimum item height, and 12px text. Keep menu material consistent with other popups.
- **Popups and dialogs have no X close button.** Outside clicks dismiss them; Escape and focus restoration remain supported. `useModalFocus` handles blocking overlays, topmost-only dismissal, and focus trapping. Keep explicit Cancel/Done actions where needed. File-tab close, search-clear, and inline message dismissal are separate behaviors.
- Popup fill, border, and shadow use `--ui-popup-bg`, `--ui-border-control`, and `--ui-popup-shadow`. Resource Usage is compact, titled **Resource Usage**, and has no Allora FPGA kicker or separate theme palette.
- Recent-project cards show three entries initially and expand to at most five, with the same keyboard/open/remove behavior everywhere. `welcome-project-sidebar` owns their shared sticky page-scroll behavior; avoid nested recent-project scrolling or independent per-page expansion logic.
- Recent chats live in a small popover, separate from the New Chat button. These adjacent controls use the shared divider/hover group behavior. Respect shared disabled, focus, and reduced-motion rules across all controls.

Scrollable content must stay within the intended surface: advanced Pin Mapping tables retain rounded edges without horizontal clipping; Health scrolls inside Bitstream's output area; preflight checks scroll inside their right-side panel; Inspect mapped ports scrolls inside its own panel rather than moving the other sidebar cards.

## Editor behavior

The editor is an open canvas without an outer frame or sectional borders. Open-file tabs remain rounded, reserve room for filenames and close controls, and reveal their X on hover or keyboard focus (always available on touch).

The line-number gutter aligns with the shared page inset. Code softens only at the **right and bottom** clipping edges through `ui-workspace-soft-code-edges`; the left side, gutter, and header remain sharp. The code edge overlay has no color wash that could appear as a faint rectangular frame and does not intercept input.

Monaco retains italic comments. Font metrics are refreshed after the bundled normal/italic/bold faces load and when font size changes; rendered-token measurement avoids selection/caret drift in italic text.

Unsaved work autosaves after **3 seconds**, with Cmd+S/Ctrl+S still available. The right-aligned header says **Autosave: On**, without a cloud icon or interval label, beside the save status. Autosave uses current edits and respects generated-file ownership; filesystem writes go through Tauri.

## Project lifecycle and persistence

`src/App.tsx` owns welcome/project selection, physical-board setup, board-free setup, memory-project setup, and the unified dashboard. Design-tool launches carry an explicit section rather than depending on an execution target. `simulation-setup` remains the internal stage for creating a board-free project; it is not a separate workspace mode.

Every disk-backed project has `allora-project.json` plus HDL and optional constraints, testbenches, simulation metadata, and generated files. Typical directories are `src/`, `constraints/`, `sim/`, and `build/`. The project directory is the source of truth. `src/data/projects.ts` persists lightweight recent-project information in `localStorage`; disk-backed source contents are excluded to avoid stale copies and storage limits.

Metadata records the project name, board/virtual target, language, top module, starters, and relevant simulation/tool configuration. Physical constraints, original simulation metadata, Peripheral Workbench metadata, and design-tool manifests remain independent.

Physical-board setup has Project Details, Project Structure, and Board Summary columns. Empty Project is the default; language/top/source changes determine output names. Optional testbench creation produces a scaffold rather than a fully connected verification environment. Optional local Git initialization checks Git availability, runs `git init`, and writes ignore rules; it does not commit, add a remote, authenticate, or push.

The shared explorer presents Files or a lightweight RTL hierarchy from current in-memory Verilog/SystemVerilog or VHDL. Clicking a module/instance opens its definition. This source hierarchy is not a synthesized netlist. Generated Studio/Register Builder files are protected from ordinary editor writes.

## Feature architecture

### Peripheral Workbench

`src/lib/peripheralWorkbench.ts` owns versioned metadata, validation, migration, UART host models, and serialized cycle advancement. `src/pages/dashboard/PeripheralWorkbench.tsx` owns the library/canvas/inspector and simulation command queue. Workbench metadata is stored under `peripheralWorkbench` without replacing physical constraints or original simulation metadata.

The Verilator backend uses blocking compilation/discovery workers, unique temporary directories, half-cycle traces, configured picosecond timing, and decimal strings for precise 64-bit inputs. Workbench batches are bounded at 256 cycles and split at UART transmit deadlines. Source changes invalidate sessions; leaving the workspace releases buttons and pauses execution. Reset recreates the model. See the peripheral examples and README for operating details.

### Memory Asset Studio

`src/lib/memoryAssets.ts` owns deterministic image/binary/table conversion, the typed memory model, `.hex` serialization, and synchronous ROM generation. `src/pages/dashboard/MemoryAssetStudio.tsx` owns assets, conversion settings, previews, and generation. Welcome enters its project-selection flow; the dock enters the current project's Studio.

The manifest is `assets/memory-assets.json` (schema 1), sources live in `assets/sources/`, and outputs live in `src/generated/`. Native asset operations check expected bytes before replacing/deleting files. Reopening registers the manifest's current outputs. Editor autosave excludes owned paths. Icarus, Yosys, and interactive Verilator stage generated memory files before tool execution.

### Register Builder

`src/lib/registerBuilder.ts` owns map validation, synthesizable RTL, C constants, instantiation snippets, and reviewed wrappers. The native bus uses byte offsets, aligned full-word writes, synchronous reset, and combinational reads. RO is hardware-driven; WO reads zero; W1C has hardware-set inputs with set priority over clear.

`src/lib/registerBuilderProject.ts` stores drafts and ownership in `Register_Map/register-builder.json`, using expected bytes and SHA-256 checks through the asset service. Modified/unowned outputs block destructive regeneration. Assisted integration uses Yosys discovery and explicit port selections, generates a wrapper, and updates top/source metadata without changing original RTL. New wrapper ports need mapping review. V1 supports one map, up to 256 registers, and 8/16/32/64-bit full-word data; no protocol adapter or physical-programming verification is included. See `examples/register-builder`.

### Build, programming, and resource inspection

`useBuildPreflight` evaluates board support, sources, selected top, mappings/conflicts, unsaved edits, and Yosys availability. Bitstream's right-side checklist uses live project data; generating remains blocked when checks fail. Unparseable custom constraints require review. Nextpnr and packers are validated by the build runner, so preflight is not proof of every tool or connected board.

Health is embedded in Bitstream; Serial Monitor is embedded in Programming. Preserve their bounded scrolling and tab behavior rather than creating separate routes/dock controls.

`UsageDialog` anchors the Resource Usage popup to the dock gauge and polls every two seconds only while open. `src-tauri/src/usage.rs` samples the Allora process and descendants on macOS, including spawned tools. CPU is per logical core and may exceed 100%; resident-memory totals are approximate. Other operating systems currently report unavailable.

### Synthesis Explorer and waveforms

`generate_synthesis_diagram_service` retains the flattened compatibility graph and adds functional, optimized hierarchical, and optional iCE40/ECP5 mapped Yosys artifacts with source/memory snapshots. `src/lib/synthesisGraph.ts` owns normalization, aliases, provenance, structural traversal, projections, statistics, and conservative waveform matching; `synthesisLayout.ts` runs pin-aware ELK routing in a worker.

The secondary viewer (`ViewerApp` / `HardwareSchematicCanvas`) supports search, hierarchy navigation, selection, tracing/isolation, bounded expansion, and culling. `explorerBridge.ts` connects editor navigation through project-scoped Tauri events (BroadcastChannel in browser previews). Source must match the synthesis snapshot. Recorded values require matching provenance, scoped aliases, widths, and bit ordering; absent/ambiguous mappings remain unavailable. Module interiors are opaque until entered. Analysis compares actual stage counts, not inferred optimization history or timing. See [Synthesis Explorer](docs/SYNTHESIS_EXPLORER.md).

## AI Design Studio and provider integration

`src/pages/ChatPage.tsx` supplies streamed Codex replies, local history, workspace selection, resumable threads, tool cards, cancellation, and queued hardware confirmations. It is available from welcome and the shared workspace dock. `src/components/ChatSession.tsx` keeps one live chat mounted through welcome landing visits, project setup, and AI project creation, preserving drafts and streaming state. AI-created projects attach to that conversation and open the dashboard in chat with its file explorer; completed AI turns refresh project files while preserving unsaved editor content. Later project chat visits within the same app run can resume project-scoped history; the first chat after launch starts fresh. Home preserves the live chat for in-app returns; a new app launch starts fresh, and saved conversations remain available explicitly in history. Recent chats are compact page controls rather than a replacement for the project explorer. Each entry shows its last-updated local date/time and the board of its latest recorded project, resolved from saved project metadata; projectless and unavailable-board states are explicit.

Code-generation requests must save a real Allora project and source files through MCP instead of pasting generated code into chat. Existing-project edits inspect and update that project. `create_project` accepts an explicit `parentDirectory`; when omitted it sends a dedicated folder-selection elicitation, routed by the native chat bridge to `project_directory_required`. Chat opens the existing OS folder picker and returns its result through `ai_chat_project_directory`; there is no in-chat save-location question. Cancellation stops creation, with no automatic default or repeated picker. Directory responses are typed separately from hardware approvals, accept only current root-turn requests, and cannot authorize programming. A selected workspace-save destination applies only to the next request. New chats can send without choosing a workspace first; the native host uses an empty app-cache transport scope, never an implicit save location. The board catalog includes Allora Virtual FPGA so board-free/simulation-only code can be saved without inventing hardware compatibility.

Ultra enables the installed app-server's multi-agent capability. `ChatTaskPanel` uses a custom hierarchy SVG and shows native plans, task lifecycles, subagents, and attributed tool calls. It expands at the start of an Ultra turn, respects manual collapsing during that turn, and adapts to constrained widths. Child assistant text stays separate from the main reply; child completion cannot finish the parent response. Stale events are filtered by root turn/descendant identity. Unfinished children are stopped before completion/checkpoint signaling; closed sessions reconnect on the next turn. Normal reasoning instructs the agent to work without delegation. Actual delegation remains dependent on model/runtime support and the work requested.

Chat supports RTL-selection, board, and error context chips; the manual file-upload picker has been removed. The editor's Ask AI action has been removed; context can still be entered through the chat controls. Attachments are quoted as reference data rather than instructions; prompt assembly caps individual context at 48,000 characters and combined context at 120,000, with truncation identified. Activity uses a 60-entry digital-design vocabulary for deliberation and tool-specific labels for real operations. Ultra's enlarged wisps are masked outside the composer and clipped below it, drifting only upward/sideways; both reduced-motion preferences hide the wisps and stop ring animation.

Project screens report actionable failures through `ProjectDiagnosticsProvider` / `useProjectDiagnostic`, covering programming, pin-map saving/conflicts, build/timing, synthesis, testbench/waveforms, interactive simulation, serial operations, peripheral/memory/register tools, editor lint, and project saves. Error notes offer **Troubleshoot in AI Design Studio**, which animates into chat and prepares an editable request; the user submits it normally. Existing drafts are preserved. Opening chat manually shows dismissible **Troubleshoot the recent error** and **Explain what went wrong** suggestions for the latest active observation. Either suggestion prepares a draft without submitting; users may also type their own request. Dismissing a version hides its suggestions without deleting memory. The normal chat button remains available after a save fails, preserving dirty editor state.

`projectDiagnostics.ts` uses an event-driven in-memory ring: four projects, six records per project, 800-character messages and 3,200-character detail tails, with two-hour lazy expiry. Stable duplicate observations do not allocate new records or notify subscribers. Errors are **not automatically attached to user messages**. `projectDiagnosticMemory.ts` synchronizes changed snapshots into a bounded native cache; updates coalesce and identical completed snapshots skip IPC. The model reads the read-only Allora `get_recent_project_errors(projectPath, source?)` tool when the user requests troubleshooting, including colloquial references to a failed operation. It uses exact canonical project scope, at most three observations and a 6,000-byte response budget. The MCP child reads through one lazy authenticated loopback listener with blocking accept, bounded IO, and shutdown cleanup. No polling, background model calls, persistent logs, or serial-output capture is added. Reported errors remain reference data, separate from raw programming authorization. Navigation does not clear an observation; clearing its UI marks it cleared, without claiming a verified fix. Existing source lint remains debounced; only produced diagnostics are captured, not errors inferred from arbitrary console text. Memory expires on app restart/eviction, and native recall requires a saved project folder. Both motion preferences skip the troubleshooting entrance animation.

Chat activity keeps the upper response indicator and omits the duplicate composer status during normal turns; conversation switching retains its separate status. Each model result tile (waveform, synthesis, timing, bitstream, report) is one native button, including its icon, title, path and padding. Inline report details are separate controls. Custom result/task/suggestion/review controls opt out of generic glass layers, and new panels/diffs use valid shared theme tokens in Ice and Black Ice. Project response tiles say **View Project** and route through the artifact navigation bridge to the text editor, including across projects; opening the current project's editor uses loaded files without requiring a disk refresh. Automatic AI project creation still preserves chat. Troubleshooting buttons are text-only with additional space from the error text.

`ChatTurnDetails` provides actual elapsed time, tool outcomes, changed-file counts, and result cards from successful structured MCP output. File diffs and restore controls are incorporated directly into the existing Turn summary dropdown; separate review buttons and the composer review overlay have been removed. Checkpoints (including initial new-project reviews) load only when that dropdown opens, with inline unavailable/retry feedback and stale-load cleanup when closed. Restore remains guarded and updates the inline review without closing the dropdown. Cards open saved synthesis/build views, exact VCD recordings, or reports; inline timing remains inspectable. `chat_checkpoints.rs` captures bounded pre-turn text snapshots of existing projects without Git commits and freezes post-turn review versions. Restore is transactional, preserves earlier saved edits and permissions, rejects later edits or replaced/symlinked paths, and excludes generated/owned assets, binaries, build/private folders, and oversized files. Up to eight checkpoints persist in process (512 eligible files/4 MiB each), expiring at restart/eviction. New-project turns expose real initial-file diffs as review-only; restoring subsequent turns preserves the created project folder. Completed activity and compact card metadata remain in chat history; checkpoint/creation diff contents do not persist there.

Settings' AI Integration destination supports Codex and Claude Code installation/authentication status through `AiIntegrationSettings.tsx`, typed `aiIntegration.ts` calls, and `src-tauri/src/ai_integration.rs`. CLI discovery excludes the Codex desktop application's managed runtime. Checks have timeouts and structured results. On macOS, Connect opens the provider's normal login in Terminal; providers own credentials. Connected means local CLI authentication, not a successful live model request. Embedded chat uses Codex; Claude retains setup/login support.

`src/lib/aiChat.ts` wraps the native chat commands. `src-tauri/src/ai_chat.rs` uses the installed Codex CLI's JSON-RPC app-server and existing account, configures Allora's MCP server, and disables ambient execution tools without changing global Codex configuration. `--allora-mcp` runs `ai_mcp.rs` for catalog/toolchain context, workspace-scoped project/file operations, verified pin assignments, lint, finite simulation, builds, job polling/cancellation, and confirmed programming. Artifacts are bound to source/board/bitstream hashes. A direct affirmative programming instruction in the raw user message supplies single-use consent for that root turn only; attached text, ambiguous/hypothetical/negated commands, and child agents cannot supply it. MCP may reuse that consent only when discovery identifies a single unambiguous candidate for the selected board. Otherwise the user answers the programming/target form; freshness, target compatibility, and programmer checks always apply. Browser UI checks do not verify live native chat, hardware programming, or tool execution.

## GitHub integration

Publish to GitHub is a single explorer entry point. Local creation, editing, simulation, and builds do not require GitHub or network access.

Allora uses OAuth Device Flow as a public native client. The project owner must supply `ALLORA_GITHUB_CLIENT_ID` and enable Device Flow; there is no desktop client secret. Tokens stay in Rust and the OS credential vault, never in WebView/project/localStorage data, logs, remotes, or command arguments. Status validates tokens and requests reauthentication when needed.

`src-tauri/src/github.rs` owns REST authorization/repository operations and direct system-Git execution. `src/lib/github.ts` is the typed boundary; `GitHubPublishDialog.tsx` owns the UI. HTTPS pushes use a restricted temporary askpass helper and child-process environment. `gh` is optional diagnostics, not an authentication dependency.

Sign-in, commit, repository selection/creation, remote connection, and push are explicit actions. New repositories default private. Guided controls do not replace mismatched origins, force push, or silently fetch/pull/merge; command mode executes Git commands explicitly entered by the user without a shell. Ahead/behind uses existing local refs. See [GitHub Integration](GITHUB_INTEGRATION.md) for full behavior and security boundaries.

## Repository and runtime

- `allora-fpga/` — React 19 / TypeScript / Vite frontend and Tauri 2 / Rust desktop app.
- `allora-fpga/src/pages/welcome/` — Workspace/Design Tools welcome routes, project cards, and pin browser.
- `allora-fpga/src/pages/dashboard/` — unified workspace sections and shared dock/explorer coordination.
- `allora-fpga/src/components/ui/` and `src/styles/` — shared UI behavior, control variants, workspace layouts, and Ice/Black Ice tokens.
- `allora-fpga/src/hooks/` and `src/lib/` — editing/persistence state, typed native wrappers, and domain logic.
- `allora-fpga/src-tauri/` — filesystem, tools, simulation/build processes, programming, serial I/O, provider/GitHub services, and viewer windows.
- `allora-website/`, `examples/`, and `docs/` — website, runnable examples, and focused architecture references.

Monaco provides the editor; Verilator provides interactive simulation; Icarus (`iverilog` / `vvp`) provides testbench execution; Yosys, nextpnr, and family-specific packing/programming tools provide hardware builds. External tools are resolved from the environment and common installation paths. Board definitions/capabilities determine actual support, not merely catalog presence. `src/main.tsx` selects the secondary viewer for viewer query URLs.

## Development and validation

```bash
cd allora-fpga
npm install
npm run tauri dev
```

Frontend checks are `npm test`, `npm run lint`, and `npm run build`. Native changes also require relevant `cargo check`, `cargo test`, and formatting checks from `src-tauri/`. The frontend build has known nonblocking chunk-size/IIFE advisories.

Use focused UI checks where geometry or interaction needs confirmation; do not repeatedly inspect every page for a small change. Cover Ice/Black Ice, keyboard focus, reduced motion, and constrained layouts as relevant. Native filesystem/tool/programmer/serial behavior requires the Tauri runtime; browser previews only verify frontend behavior.

## Current boundaries and working principles

- Interactive execution supports Verilog/SystemVerilog signals up to 64 bits; VHDL interactive execution and top-level `inout` are unsupported.
- Hardware capabilities vary by board family. A frontend build, a catalog entry, or a passing preflight does not verify physical programming.
- Generated testbenches remain scaffolds. Physical-programming verification and embedded Claude chat are not implemented.
- Resource sampling is macOS-only; cross-platform behavior must not be assumed from a browser preview.
- Preserve the unified workspace. Express operation availability through board capabilities, not separate navigation modes.
- Reuse shared control/theme/layout behavior; retain the documented framed-tool and explorer exceptions. Avoid neutral hardcoded colors and duplicated page-level variants.
- Keep project files canonical, preserve generated ownership, and use typed Tauri wrappers for native behavior. Git must not bypass the file-save path.
- Keep network/authentication/Git/hardware actions explicit; never add hidden commits, remotes, pushes, or credential storage.
- Preserve unrelated working-tree changes. Keep this guide current and record meaningful implementation history in `CONTINUATION.md` rather than accumulating obsolete instructions here.

AI completion notifications: `chatNotifications` keeps in-memory unread/toast state. Explicit ChatSessionHost visibility suppresses notifications while chat is active. Off-screen completed turns show a four-second theme-aware popup with animated Ultra border/all-direction smoke and entrance/exit motion; shared AI icon traces glow until chat is opened. Toast dismissal preserves unread. No OS notification or polling.
