# Synthesis Explorer

Run Synthesis from an existing Yosys-backed board project. The existing dedicated viewer window now hosts the Explorer. Reopened matching `build/synthesis-diagram.json` results work with the same window path. Older saved diagrams remain usable with an explicit metadata limitation; rerun synthesis to obtain pins, hierarchy, source locations and additional views.

## Data flow

Previously, `generate_synthesis_diagram_service` wrote the design sources into a temporary workspace, ran Yosys (`proc`, `opt`, `fsm`, `memory`, `flatten`, `check`, `write_json`), and converted only the top module to compact nodes and driver/consumer edges in Rust. Bit identities, pin names, net aliases, parameters and `src` attributes were discarded. `SynthesisSection` opened `ViewerApp` through `openViewerWindow`; `HardwareSchematicCanvas` aggregated edges by endpoints and rendered an ELK-laid-out SVG.

The same service, saved report, window manager, viewer and renderer remain in use. The response still contains the original flattened `nodes`/`edges`, keeping the synthesis report and MCP consumers compatible. It additionally retains authoritative Yosys JSON artifacts and the actual synthesis source/memory snapshots:

- **Functional:** `proc`, `memory_collect`, `opt -nodffe -nosdff`, `fsm -nomap`, then `write_json`. This is a process-lowered, initially optimized representation with hierarchy, collected memories and FSM cells where Yosys actually extracts them. It is not the original RTL AST. Deferring register-enable/reset folding allows the FSM detector to see state registers.
- **Logic:** subsequent normal `fsm`, `opt`, `memory`, `opt`, then `write_json` before flattening. Memories and FSMs may now appear as registers, muxes and operators. The original flattened compatibility graph is still generated afterward.
- **Technology:** a separate optional Yosys invocation rereads the same design and runs `synth_ice40` or `synth_ecp5`. Mapping failure is logged and leaves the two portable views intact. Selection is disabled when no mapped artifact exists. These are synthesis resources, not placed/routed utilization or timing measurements.

Physical bitstream synthesis, nextpnr, packers and programming were not changed. Yosys remains authoritative. The existing ELK dependency is reused; no new packages were added.

`src/lib/synthesisGraph.ts` normalizes a single real module to nodes, directional pins, named net aliases and connections carrying source/destination bit indices. Numeric bit IDs are local to their Yosys module/stage. Repeated constants retain every destination lane; different pin connections stay separate; feedback is retained without inventing inout terminal self-links. Missing directions produce warnings and are not guessed. Black-box resource library definitions remain FPGA primitives, rather than navigable user modules.

`src/lib/synthesisLayout.ts` lays out real pin endpoints orthogonally with ELK, reserving wire-label and external pin-label geometry. Wire labels appear at detailed zoom or on traced/selected paths; binary overlays are abbreviated on the canvas and remain complete in the inspector. Thin traces and small direction arrows scale cleanly with the diagram. `HardwareSchematicCanvas` owns navigation and rendering; `SynthesisInspector` owns contextual details and measured design statistics. Layout runs in an ELK Web Worker. The render projection can summarize cell categories and limit expanded detail without modifying the underlying analysis graph.

## Exploration

- The sectioned toolbar separates view/search, zoom, tracing and panels. The title shows the active module; only ancestor breadcrumbs are navigation buttons. Design overview and selection inspectors minimize into the toolbar and can be restored. Inspector scrolling, dragging, double-clicks and keyboard input do not manipulate the canvas. Zoom buttons are flat until hovered.
- Drag to pan, wheel to zoom; use Fit, 1:1 and zoom buttons. Escape clears selection/tracing; F fits while the canvas has focus.
- Select cells, wires or named signals. Search includes identifiers, cell types, modules and net aliases in the current module. Hover titles identify types, pins, widths and control roles.
- Double-click a module instance or select **Enter** to navigate its real module definition. Breadcrumbs return to parent instances. Each instance path remains available for scoped waveform matching.
- **Groups** collapse/expand explicit hardware categories. Summaries show actual member counts and connection counts; a grouped link is not labeled as a bus. Selecting a grouped connection inspects its first real member and explains that choice. Expand for individual paths.
- At low zoom, compact category marks replace detailed symbols; closer zoom reveals gate shapes, pin labels, bus widths and identifiers. Memories, FSMs, module instances, muxes, registers, arithmetic and gates have distinct symbols; LUTs and primitives retain real resource types.
- Select a wire to start a forward trace, or use Fan-in/Fan-out on a component or signal. Choose a bus bit in the inspector. Storage boundaries stop at registers, collected memories and extracted FSMs by default. Hierarchical module interiors are always opaque boundaries: enter the instance to inspect its interior. Isolation hides unrelated circuitry; clearing restores it.
- The inspector shows pins, bit connections, drivers/destinations, source spans/snippets, numeric width/state/memory parameters, synthesis attributes and resource types. Statistics navigate to actual categories. Stage counts recursively account for instantiated user modules; black-box primitives are counted as leaves.

Tracing describes structural reachability. Once it crosses an operator, it follows its output connections; it does not compute exact Boolean/bit influence, signal values, delay or timing. Paths are local to the displayed module. No propagation animation claims activity or timing.

For large modules, category summaries are enabled automatically above 800 elements. Expanded layout is initially bounded to 800 nodes, with an explicit notice when detail is omitted. The budget can increase in 800-node increments up to the current module size; requesting more detail is explicit and can be expensive; search can bring omitted components into the projection. SVG nodes/wires outside the viewport are culled. Analysis/tracing keeps the full graph. Extremely large artifacts still incur parsing/memory costs; whole-design hierarchical traversal and streaming artifact loading are future work.

## RTL navigation

`src/lib/explorerBridge.ts` exchanges project-scoped events through the existing global Tauri event API; browser fallback uses BroadcastChannel. The main Dashboard listens for source-navigation requests and uses the existing editor tab/navigation flow. Monaco publishes debounced statement/expression selection ranges including columns. Disposed viewers/editors clean up their listeners.

RTL highlights use Yosys `src` spans, including merged origins, in the active module/view. Named wire/register declaration spans also highlight their real numeric-bit connections and drivers; this is a connectivity association, not an invented cell source span. Constant aliases do not spread highlights to unrelated constant-driven cells. Highlights recompute when the user changes stage or enters another module. Source filenames resolve only against exact synthesis input paths, including the temporary workspace's `src/` prefix. **Open in editor** selects the preserved source span. Navigation and highlighting reject edited source content rather than applying an old span to different code.

Yosys spans are provenance, not proof of one-to-one correspondence. Optimization can merge, remove or regenerate cells. Source snippets come from the synthesis snapshot; missing/unresolvable locations are identified explicitly. Selection continuity between stages uses stable IDs or one unambiguous identical source span; otherwise selection clears. Source selections inside another module require navigating to that instance.

## Recorded simulation

1. Run a real Testbench simulation in the main project with waveform capture enabled.
2. Choose **Attach recorded simulation** in the Explorer. The latest recorded run is delivered with source/memory snapshots from the native simulation response. Source or generated-memory mismatches reject the recording. The synthesis/simulation workspaces stage those captured memory bytes directly, so a subsequent external file edit cannot silently change the inputs represented by the provenance.
3. Enter the exact VCD DUT scope, such as `counter_tb.dut`. The DUT field suggests scopes ranked by exact matching aliases; choosing a scope remains explicit. Matching requires a unique full scoped alias and identical width. Child-module navigation appends the actual instance path. No short-name/fuzzy matching is performed.
4. Scrub the recorded integer timeline. Supported whole connections and inspector pins/signals show recorded binary values, including X/Z, and transitions at the selected tick are colored. Select a signal bit to inspect its recorded bit value. Unmapped signals remain without values and the inspector explains missing scope, provenance/constant folding, ambiguity or absent recorded events; constant-folded/mixed-constant aliases are deliberately excluded.
5. **Open waveform** opens the existing waveform window with the selected mapped signal. Its Explorer-time slider and signal selection navigate back to the same recording in the open Explorer. Recording IDs prevent older waveform windows from changing a newer recording.

The shared VCD parser now optionally preserves scoped aliases with distinct UI IDs and omits synthetic initial values. Existing consumers retain their default alias compaction. Multiline timescale directives are parsed; missing units are labeled ticks. Values before the first recorded event remain unavailable. Wire overlays reconstruct destination lanes from numeric bit identities and explicit connection indices, supporting slices/reversals when matching recorded aliases cover every lane. Conflicting alias values, missing lanes and constants suppress the overlay; no unordered-bit-set matching is used. Explorer values are unavailable for timestamps beyond JavaScript's exact integer range.

This is recorded RTL simulation, not gate-level or physical FPGA simulation. It does not attach arbitrary saved VCD files without provenance, infer remapped/renamed nets, play a live Verilator session, or reconstruct activity eliminated by synthesis. Renamed-net equivalence across synthesis stages and ambiguous aliases remain unsupported.

## Analysis limits

The overview compares actual functional/logic/mapped leaf-cell and hierarchy counts. It describes snapshot differences without attributing a specific optimization solely from the final netlist. The overview now includes module-local combinational operator depth. Each combinational cell counts as one stage; storage, opaque primitives and module interiors cut paths. Feedback and its downstream dependents have unresolved depth. This is structural depth, not delay or exact Boolean influence.

New native synthesis runs collect seven measured optimization checkpoints (process lowering, memory collection, initial optimization, functional FSM extraction, FSM mapping, memory mapping and final logic optimization). These are pass-group count snapshots, not a record of every internal optimization or a formal transformation explanation.

For saved projects, each successful native synthesis includes compact leaf-type and hierarchy counts from the preceding saved build when FPGA and top module match. The inspector compares stage/category counts without retaining an unbounded chain of old netlists. Legacy results have no baseline or checkpoints until rebuilt.

There is no formal cell-equivalence map, placed-resource percentage or net-level timing annotation. Existing timing and build reports remain available in their existing viewers. No missing RTL, waveform, optimization or timing data is manufactured.

## Nonvisual verification

From the repository root:

```sh
npm --prefix allora-fpga run build
npm --prefix allora-fpga run lint
npm --prefix allora-fpga test
cargo test --manifest-path allora-fpga/src-tauri/Cargo.toml --no-fail-fast
```

`tests/synthesis-explorer.test.mjs` exercises graph normalization, pin/bus/repeated-constant connectivity, hierarchy, feedback and boundary traversal, column-aware source provenance, selection continuity, category projection, missing metadata, 12,000-node analysis, VCD scope/alias/X/Z/time handling, ELK pin layout, window/event protocols and actual Yosys artifacts from `tests/fixtures/synthesis-explorer.sv`. Node protocol tests use mocks/BroadcastChannel, never a browser or application launch. Native tests cover actual iCE40 and ECP5 services and preservation of a real extracted FSM before mapping, alongside existing memory/register/simulation/build tests.

The initial implementation had no visual verification. This shipping-hardening pass used ADE’s browser with a real Yosys fixture and the actual Explorer component to check toolbar layout, overview minimization/restoration, port selection, hierarchy navigation, thin traces and label geometry. Inspector wheel scrolling was checked against an unchanged canvas transform. This was a browser component check, not live native multiwindow/event confirmation. Build output retains the existing large-chunk warning and emits ELK's worker IIFE export-name warning. The emitted worker also passed a Node worker protocol/layout check despite the nonblocking IIFE export-name warning. Repository-wide rustfmt checking reports unrelated existing formatting differences; new Rust synthesis hunks are formatted without rewriting them.


Additional regression tests cover sequential/opaque depth boundaries, combinational chains and feedback, exact scope suggestions, slice/reversal waveform reconstruction, and ELK label rectangles outside symbol bodies. Native tests verify compact previous-build counts, incompatible FPGA rejection and all seven optimization checkpoints. Remaining release work includes native multiwindow smoke testing, whole-design hierarchy tracing, streaming artifact loading, live/external waveform workflows and timing-report integration.


## Control and layout refresh

Explorer buttons use the app's shared glass material and motion tokens in Ice and Black Ice. Zoom buttons keep their material edge hidden until hover or keyboard focus. Fan-in and Fan-out toggle off on a second click, also disabling isolation, while retaining the selected item's inspector. The separate Clear toolbar button is removed; Escape and canvas deselection still clear selection.

Layout bounds are computed iteratively rather than spreading route coordinates into a function call. If ELK reports stack exhaustion, the Explorer retries with simple placement and interactive crossing minimization. If that retry also exhausts the stack, a nonrecursive basic layout preserves every displayed node, pin and connection and announces basic routing; routes may cross circuitry and wire labels remain in the inspector. Other layout errors still surface rather than being silently hidden.

Verification for this refresh includes real mapped Yosys artifact layout, forced stack exhaustion and recovery, long-route bounds, and browser checks of mapped-view switching, trace toggles, shared button hover and popup halos in both themes. The user's particular failing saved design was unavailable in the local browser preview, so its exact ELK failure was not reproduced.
