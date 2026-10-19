# Pin Mapper verification — 19 October 2026

All five findings from the verification pass are now implemented and verified within the scope below. The approved compact resource controls and divider treatment are preserved. This work was applied to the existing dirty worktree; unrelated changes were retained.

## Resolved findings

| Finding | Fix | Verification |
| --- | --- | --- |
| Output drafts disappear when opening Board Data or Pin Catalog | Mount Map Outputs on its first visit and keep it mounted, hidden from layout and accessibility while inactive. Declarations, assignments, selected port, searches, unfinished form fields and prepared download stay in component state. Changing boards still resets the board-specific mapper. | Actual Welcome route: create a three-bit output, map all bits, prepare the download, visit both tabs and return with all mappings and Download constraints intact. |
| Quartus bus exports are invalid Tcl | The QSF writer uses braced bus references. The reader accepts braced, quoted and legacy plain references. | Regression evaluates the exported scalar/bus assignments with real `tclsh`, checks literal port arguments and reloads the mappings. |
| GateMate output exports declare inputs | CCF emits `Pin_in`, `Pin_out` or `Pin_inout` from the actual port direction, with semicolon terminators. The reader recognizes all three and retains compatibility with old input-only output. | Regression covers all directions, vector port names and round-trip loading. Syntax follows the vendor's [ILA examples](https://github.com/colognechip/gatemate_ila/blob/main/README.md). |
| Unselected output rows are unreachable by keyboard | Roving row focus supports ArrowUp/ArrowDown, Home/End, and Enter/Space selection. Row focus updates the selected output; nested Clear/Remove actions remain separate. Focused rows scroll below the sticky table header. | Actual Welcome route: navigate all three bus rows with keyboard; inspect the selected-row state and assignment target. |
| Narrow layouts clip controls and overcompress the assignment table | The work column has container queries. Headers/toolbars adapt below 850px of available width; panels stack below 760px. Below 480px, assignment rows become compact two-column records and all three section controls fit. The stacked board list sizes to its content with a bounded maximum height. Assignment/pad scrolling stays within the workspace. | Actual Welcome route inspected in Ice and Black Ice at 1440, 1024, 800 and 390px. Status, Clear and Remove fit the assignment surface; keyboard navigation and prepared downloads remain reachable. |

## Implementation locations

Paths below are relative to `allora-fpga/`:

- `src/pages/welcome/PinMappingBrowser.tsx`: retain the visited output mapper while switching information tabs.
- `src/pages/welcome/WelcomeOutputMapper.tsx`: hidden state, row focus and keyboard navigation.
- `src/pages/dashboard/pinMappingUtils.ts`: QSF quoting, direction-aware CCF, and updated readers.
- `src/styles/pin-browser-welcome.css`: available-width layout, compact records, bounded scrolling and focus scroll margins.
- `tests/board-resource-ui.test.mjs`: three behavioral export regressions, including actual Tcl execution.

## Verification

- **222 frontend tests passed**, with no failures or skips, including the real Tcl regression.
- Full ESLint, TypeScript/Vite production build and `git diff --check` passed after the final code changes. Existing IIFE/chunk-size build advisories remain nonblocking.
- UI verification used the actual Welcome route in ADE's browser with an isolated profile. It did not use a mocked native filesystem or a separate browser automation backend.
- Both themes and desktop/stacked/phone-width layouts were inspected. A three-bit AC701 LED mapping and its prepared download survived both information tabs. ArrowDown, End and Home navigated the bus rows, with the focused row visible below the sticky header.
- Proof: `c5b99750-ee2c-48d0-b052-312303c3bb87` demonstrates tab retention and keyboard navigation; `c8abf057-4db4-413b-be16-3beecd892cf9` shows the 1024px full-width assignment table; `9fe79bfd-8bac-4a21-a92d-b5c49582178f` shows the 390px section controls and output form, with further content below the scroll area. Superseded bug captures were removed from this chat's drawer.

## Scope and remaining limits

These five reported bugs are closed. Draft retention lasts for the selected board's current Pin Mapper session; this does not add persistence across app restarts or changing boards. No vendor Quartus/GateMate implementation, packaged Tauri-window interaction, live AI turn or physical/electrical hardware test was performed. The shared export text and Tcl execution were verified; vendor hardware/tool acceptance remains outside this pass. The prior native test result (95 passed, four ignored) belongs to the preceding audit; native code was unchanged and that suite was not rerun for these frontend fixes.
