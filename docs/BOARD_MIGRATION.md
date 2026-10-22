# Board Migration Assistant V1

Choose the persistent **Migrate Board** button below **Publish to GitHub** in the project explorer. When the explorer is collapsed, use the matching arrow action at the top of the workspace dock. The assistant is a project workspace with normal Back navigation. Destination choices require configured programming support and an app-supported synthesis and bitstream flow; boards without a build flow are omitted.

## User flow

Choose a destination and top module, optionally change the copy location, then choose **Migrate**. Saving must succeed before inspection. If every analyzed requirement is supported and unambiguous, the assistant creates a new project copy and opens its summary. **Review proposed changes before creating a copy** makes even a fully automatic result stop at the editable review.

An unresolved requirement stops automatic creation and shows its port, file and line where available. Users can change destination pin choices, explicitly preserve cycle counts for a changed clock, or select a supported literal clock-frequency parameter to update. **Continue manually in a project copy** applies the safe changes and records the remaining issues in that copy. The source project remains intact. Source constraints are archived as `.allora-migration/<source fingerprint prefix>/<original relative path>.txt`; their suffix keeps them out of active constraint discovery.

The summary links to Pin Mapping, Editor, Testbench and Bitstream. A manual draft requires an explicit review-complete acknowledgement and complete, conflict-free assignments for the elaborated interface before its review can be completed. Both frontend preflight and the shared native GUI/MCP bitstream service reject a pending or stale migration review.

## Automatic migration boundaries

- Destinations are exact catalog variants with configured programming, verified identity and physical pin data, and working synthesis/bitstream capabilities. Current build support is the existing Yosys/NextPNR iCE40/ECP5 flow. Boards without an app-supported build flow are omitted from the destination list.
- Source constraints resolve to verified logical resources, then unique destination resources. Physical package-pad numbers come from the destination board. Names alone are insufficient for unknown GPIO/peripheral wiring. Explicit pin choices can resolve ambiguous destination assignments.
- Bounded declaration parsing preserves original bus indices, including ascending/nonzero and one-bit vectors. Yosys elaboration independently checks the selected Verilog/SystemVerilog interface. Parser/elaborator disagreements, unavailable tools and unsupported syntax require manual review.
- Automatic source-constraint reading understands simple PCF and LPF assignments, documented LPF I/O standards, and oscillator-frequency declarations. Repeated assignments, unknown directives and electrical/clock declarations that disagree with verified source data require review. Every original constraint file is preserved in the copy's archive.
- Clock-frequency changes require an explicit cycle-preservation choice or selection of a literal `CLK_HZ`, `CLOCK_HZ`, `CLK_FREQ_HZ` or `CLOCK_FREQ_HZ` parameter whose old value equals the source oscillator. Parameter changes must preserve the elaborated top interface. Arbitrary counters and ambiguous real-time intent require manual editing.
- Verified LED/button polarity differences produce a separate Verilog/SystemVerilog adapter which instantiates the original core and preserves each interface bit. Unknown polarity, bidirectional or differential interfaces, multiple clock domains, and detected device-specific PLL/memory/I/O primitives require review.
- Complex vendor IP, general primitive conversion, VHDL elaboration/builds and advanced peripheral conversion remain outside automatic V1. A manual copy can retain unsupported design content for user work. A board-free source also requires manual physical mapping.
- Resource fit and achievable timing are established by the destination build.

## Project-copy implementation

`src/lib/boardMigration.ts` owns typed analysis, diagnostics, reviewed choices, constraint generation and adapter plans. `BoardMigrationSection.tsx` owns the workflow and `Dashboard.tsx` owns the persistent project-level entry. `allora-project.json.boardMigration` stores a versioned report and pending-review flag. Independent simulation, Peripheral Workbench, Memory Asset and Register Builder configuration is preserved. Old board-specific AI pin assignments are removed. The copied project has a new recent-project record and its own path.

`src-tauri/src/board_migration.rs` provides asynchronous typed `inspect_board_migration` and `create_board_migration_copy` commands. Inspection hashes relative paths and exact bytes. Copying rechecks that fingerprint, validates paths, preserves binary bytes/relative paths/file permissions/empty directories, stages changes, archives constraints, and reserves a unique destination folder. Source changes, symbolic links, special/unreadable files, invalid patches or a nested destination cause an error; staged failures are cleaned up. Existing destinations are never overwritten.

The copy excludes `.git` metadata and root `build/`, `node_modules/` and `target/` caches. `.gitignore` and authored content remain, and copied metadata records Git as uninitialized. No repository initialization, commit, remote, push, project hook or programmer is invoked by migration. Limits: 4096 files/directories, 256 MiB copied bytes, 2 MiB per analyzed text file, 16 MiB analyzed text and patch payloads, and 128 patches. Binary and oversized non-HDL assets can still be copied byte-for-byte within the copy limits.

## Validation

**Run validation** saves and re-inspects the migrated revision, checks physical port coverage, runs the sole existing testbench when there is exactly one, then runs the existing synthesis and destination bitstream/timing services. No testbench or multiple testbenches is an explicit skipped simulation result with a route to Testbench. Missing tools and runner failures are shown independently. Results are discarded if files change while checks run, and visible results disappear after project edits. `build/board-migration-validation.json` records the checked fingerprint and outcomes. Physical testing stays explicitly unverified; programming requires its separate user action.

Focused regression coverage is in `tests/board-migration.test.mjs` and native `board_migration::tests`. Native tests include actual Yosys port discovery, binary/tree preservation, stale-source rejection, cleanup, symbolic-link refusal, review gating, and a copied project's real Icarus simulation/Yosys synthesis/NextPNR build with passing 12 MHz timing. Frontend tests also compile and simulate the generated polarity adapter with Icarus when installed.

`tests/board-migration-ui.html` is a repeatable component fixture with visibly labeled mocked native responses. It exercises the actual entry menu, automatic summary, manual diagnostic/takeover, review gate and validation presentation. Its preset destination control supplies a normal select change event when native menu selection cannot be driven through background Accessibility. It is frontend evidence; it does not establish packaged native behavior or physical hardware operation.
