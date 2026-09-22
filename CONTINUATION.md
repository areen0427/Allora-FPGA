# Allora FPGA — Continuation Log

This is the living handoff for future development sessions. Update it after every codebase change so the next contributor can continue without reconstructing architectural decisions.

## 2026-09-22 — Animated welcome destination handoff

Changed:

- Added a short, target-colored depth handoff when choosing Simulate or Build: the selected glass card brightens, a circuit-like pulse expands from its side of the screen, the welcome controls recede, and the destination header and content rise into place.
- Kept the Ice and Black Ice molecular welcome artwork behind the Simulate and Build main screens only, using an oversized blurred and theme-veiled layer so the scene remains recognizable without competing with project controls.
- Preserved immediate transitions for reduced-motion users, disabled repeated destination input while a handoff is active, and added an accessible label to the icon-only destination back button.
- Left simulation project setup, physical project setup, and the project dashboard backgrounds unchanged.
- Follow-up polish keeps one persistent molecular-background element mounted through the handoff. Its zoom, blur, and theme veil now end at the exact values used by the destination, removing the former image-layer swap between screens.
- Extended the handoff to 620 ms and added independent bring-forward animations: the two Simulate panels arrive in sequence, while Build's section heading, board cards, and sidebar cards enter with a short stagger. Completed card animations release their transforms so existing hover motion still works.
- Promoted the destination rail into an explicit high-priority compositing layer, fixing a native WebView case where the filtered fixed background could paint over the still-clickable Home and Settings controls.
- Added a persisted Reduce Animation toggle under General settings. It defaults off and only bypasses the new welcome handoff, background transition, and destination-card entrances; existing hover motion and unrelated application animations remain unchanged.

Validated:

- `npm run build`
- `npm run lint`
- Browser visual QA of the welcome-to-Simulate and welcome-to-Build transitions.
- Browser visual QA of the blurred Simulate and Build backgrounds in Ice and Black Ice.
- Browser QA confirmed Reduce Animation defaults off, applies immediately, persists across reloads, and keeps Simulate navigation functional when the new landing transitions are disabled.
- Confirmed the existing production bundle-size advisory remains the only build warning.

Known limitations:

- The transition is intentionally CSS-driven and does not attempt a geometry-perfect shared-element morph between the compact welcome card and the responsive destination layouts.

Next:

- Exercise the handoff in the native Tauri WebView and tune the 620 ms timing only if it feels materially different from the browser preview.

## 2026-09-19 — Added reversible Virtual FPGA V0.2 product experiment

Status: Accepted for continued development. Keep the V0.2 direction and build forward from it.

Changed:

- Added a first-class simulation-only project flow that does not require choosing a physical board. It creates disk-backed Verilog/SystemVerilog projects with blank, guided counter, or PWM starters and opens directly in Virtual FPGA.
- Added an internal Allora Virtual FPGA target that remains outside the physical board catalog and prevents the Build workspace from opening until real hardware is chosen.
- Added preconfigured virtual clock, reset, switch, and LED mappings to the guided starters.
- Added a compact guided-project progress strip driven by actual source, mapping, compiled-session, and captured-waveform state.
- Added an embedded live waveform panel to Virtual FPGA. It records real simulation snapshots, supports up to six selected top-level signals, and links waveform selection with the signal inspector.
- Persisted each project's last execution target and changed the welcome Continue Project card into a target-aware Resume Simulation or Resume Build action.
- Added a primary New simulation project action to the existing Simulate home while retaining Open existing.
- Kept the implementation directly in the working tree without creating or changing branches, commits, or other Git structure. The change is intentionally concentrated in the simulation setup, project metadata/workspace helpers, welcome resume flow, dashboard target boundary, and Virtual FPGA panel so it can be reversed independently if rejected.

Files:

- `allora-fpga/src/App.tsx`
- `allora-fpga/src/data/boards.ts`
- `allora-fpga/src/data/projects.ts`
- `allora-fpga/src/lib/projectWorkspace.ts`
- `allora-fpga/src/pages/BoardSelect.tsx`
- `allora-fpga/src/pages/Dashboard.tsx`
- `allora-fpga/src/pages/SimulationProjectSetup.tsx`
- `allora-fpga/src/pages/dashboard/VirtualFpgaSection.tsx`
- `allora-fpga/src/pages/welcome/HomeView.tsx`
- `allora-fpga/src/styles/dashboard.css`
- `allora-fpga/src/styles/project-setup.css`
- `allora-fpga/src/styles/themes/black-ice.css`
- `allora-fpga/src/styles/virtual-fpga.css`
- `allora-fpga/src/styles/welcome.css`

Validated:

- `npm run build`
- `npm run lint`
- Browser visual QA of Simulate home and New simulation project in Ice and Black Ice at the available desktop viewport.
- Confirmed the existing production bundle-size advisory remains the only build warning.

Known limitations:

- Native creation and the real Verilator waveform lifecycle still need a Tauri desktop smoke test; browser preview cannot write the project directory or run native tools.
- Simulation-only projects intentionally keep Build unavailable until a physical-board attachment flow is implemented.
- The live waveform currently visualizes selected top-level ports as digital low/nonzero traces; internal signals and multi-bit analog-style bus rendering remain future work.

Next:

- Review the experiment in the native app. If accepted, add a physical-board attachment flow that writes board metadata and constraints into the same project. If rejected, reverse only the files listed above and remove `SimulationProjectSetup.tsx`; no Git branch cleanup is required.

Follow-up validation and polish:

- Fixed Black Ice post-compile action controls so Run, Pause, Step, Reset, and Stop use readable dark neutral, hover, and disabled treatments rather than white buttons with nearly white labels.
- Applied the same treatment to the reset-polarity mapping control.
- Corrected guided mapping completion to evaluate only the peripherals required by the selected starter rather than unused controls in the fixed virtual-board bank.
- Built the native macOS app bundle and exercised simulation-only project creation, guided counter compilation, run mode, virtual switch input, RTL-produced LED output, live waveform capture, existing-project simulation, and target-aware Resume.
- Added `V02_TEST_SCENARIOS.md` with expected and observed results.
- Development testing should use `npm run tauri dev`. Do not run the full Tauri bundle build for ordinary UI or simulator testing; reserve it for an explicitly requested release/package check.

## 2026-09-19 — Rebuilt Settings and connected simulator preferences

Changed:

- Replaced the rudimentary settings contents with four focused sections: General, Editor, Workspace, and Simulator. The modal retains the Ice and Black Ice glass treatments, uses a denser frosted backing so workspace content does not show through too strongly, and resets its scroll position when switching sections.
- Removed the project naming template and default HDL preferences. New projects accept any non-empty user-entered name, while newly created source files infer `.v`, `.sv`, or VHDL extensions from source files already present in the project instead of relying on a global HDL default.
- Replaced configurable save delay with a fixed 30-second autosave cycle. The timer runs only while the project is dirty, so unchanged projects do not trigger redundant saves.
- Added launch destination and previous-session restoration preferences. Allora can open Home or the last project on launch and can either restore the prior active file or select the first available source.
- Added editor controls for font size, tab size, word wrapping, minimap visibility, and whitespace rendering, with the new options wired into Monaco.
- Added workspace controls for new-project location behavior, generated-artifact visibility, and file-deletion confirmation. The last selected project parent directory is persisted for the Last used location option.
- Added simulator defaults for radix, step size, automatic refresh interval, execution safety limit, waveform capture, automatic waveform opening, and log detail. These preferences are connected to both the interactive Verilator workspace and Icarus testbench workflow.
- Added simulator toolchain status cards for Verilator and Yosys with native desktop detection and a manual rescan action. Browser preview explains that tool detection requires the desktop app.
- Added versioned settings migration and validation for the expanded settings model. Obsolete naming-template, default-HDL, recent-project-limit, and default-pin-mapping fields are discarded during migration.
- Saved the last opened project so the launch preference can restore it, and limited the welcome screen's recent-project display directly to five entries.

Files:

- `allora-fpga/src/App.tsx`
- `allora-fpga/src/components/SettingsModal.tsx`
- `allora-fpga/src/data/projects.ts`
- `allora-fpga/src/data/settings.ts`
- `allora-fpga/src/hooks/useFileManagement.ts`
- `allora-fpga/src/hooks/useSaveProject.ts`
- `allora-fpga/src/pages/BoardSelect.tsx`
- `allora-fpga/src/pages/Dashboard.tsx`
- `allora-fpga/src/pages/ProjectSetup.tsx`
- `allora-fpga/src/pages/dashboard/EditorSection.tsx`
- `allora-fpga/src/pages/dashboard/TestbenchSection.tsx`
- `allora-fpga/src/pages/dashboard/VirtualFpgaSection.tsx`
- `allora-fpga/src/styles/modals-settings.css`

Validated:

- `npm run build`
- `npm run lint`
- `git diff --check`
- Browser visual QA of General, Workspace, and Simulator settings in both Ice and Black Ice.
- Confirmed the obsolete project-template, default-HDL, recent-project-limit, and default-pin-mapping settings no longer remain in application source.

Known limitations:

- Browser preview cannot scan native Verilator or Yosys installations; toolchain status must be exercised in the Tauri desktop app.
- The complete native simulator path still needs an end-to-end desktop smoke test using installed Verilator, Yosys, and Icarus tools.
- The production build continues to emit the existing advisory for a JavaScript chunk larger than 500 kB.

Next:

- Run a desktop smoke test covering toolchain rescanning, last-project startup, dirty-only autosave, interactive simulation limits, and testbench waveform preferences.
- Consider splitting the settings and simulator workspaces into lazy-loaded chunks if bundle size becomes a release concern.

## 2026-09-19 — Rebuilt the product website around Ice, Black Ice, and Virtual FPGA

Changed:

- Replaced the former copper/FR4 and soldermask website themes with first-class Ice and Black Ice palettes derived from the desktop application's surfaces, controls, borders, type hierarchy, and blue/cyan lighting.
- Reframed the site for FPGA enthusiasts around one open-source workbench with two execution targets: real Verilator-backed Virtual FPGA simulation and the Yosys/nextpnr build path for supported open-hardware boards.
- Added a dedicated Virtual FPGA story using fresh captures from the current `npm run tauri dev` build. The captures show the bundled `virtual-led-counter` SystemVerilog source and the same design running with mapped controls and illuminated LEDs.
- Added matching Ice and Black Ice capture sets for the editor, running simulator, and welcome screen. Restored the original 100% image fit with 10px frame padding and removed the rotation from the welcome capture so the app window stays level and unclipped.
- Rebuilt the workflow as a shared RTL origin that branches into virtual and physical paths, and clarified that mainstream boards may have visual pin mapping and constraint support without the complete build/program workflow.
- Preserved and restyled the interactive pin-mapping demo, board comparison, searchable catalog, responsive behavior, and persistent theme switch.
- Removed the generic feature grid, approach cards, speculative instrument-suite section, technology ticker, repetitive circuit dividers, and obsolete app carousel.

Files:

- `allora-website/index.html`
- `allora-website/styles.css`
- `allora-website/app-editor-black-ice.png`
- `allora-website/app-simulator-black-ice.png`
- `allora-website/app-welcome-black-ice.png`
- `allora-website/app-editor-ice.png`
- `allora-website/app-simulator-ice.png`
- `allora-website/app-welcome-ice.png`
- `allora-website/welcome-ice.png`
- `allora-website/welcome-black-ice.png`

Validated:

- JavaScript syntax checks for `boards-data.js` and both inline website scripts.
- Local asset-reference validation for every `src` and local `href` in `index.html`.
- Browser visual QA in Ice and Black Ice at the available desktop-panel viewport.
- Interactive smoke test for theme switching, signal selection, pin placement, and generated `set_io` output.
- Confirmed the temporary development-only capture hooks were removed and left no diff in application source files.

Known limitations:

- Packaged-download links are not yet available, so the primary release action currently leads to the GitHub repository.

Next:

- Replace the GitHub-only release action with platform-specific download links when signed installers are published.
- Add release metadata and documentation URLs once their final public locations are established.

## 2026-09-19 — Finalized molecular welcome layout and utilities

Changed:

- Replaced the prior architectural-bay welcome artwork with the clean molecular-circuit renders at `allora-fpga/public/welcome_ice_molecular.png` and `allora-fpga/public/welcome_black_ice_molecular.png`.
- Rendered both backgrounds as sharp edge-to-edge `cover` images and removed the blurred fallback copy, edge masks, feathering, and theme atmosphere overlays. Added a restrained Ice-only contrast/saturation correction because the bright source contains more visible atmospheric haze than Black Ice.
- Consolidated the persistent welcome controls into one right-aligned column. The Allora tile, Simulate card, Build card, full-width Pin Mapper action, and conditional Continue Project card share the same responsive width and right edge with consistent vertical spacing.
- Preserved equal Simulate and Build dimensions, frosted materials, semantic button behavior, focus treatment, and hover depth while simplifying their copy into compact labels and signal motifs.
- Reduced the navigation rail to Home at the top and Settings at the bottom. Pin Mapping now opens from the compact action attached to Build.
- Made the Allora tile open a product-information panel containing version `0.0.0`, a repository documentation link, live recent-project and supported-board counts, the latest project, and the implemented save and waveform-zoom shortcuts.
- Added a Continue Project card that appears only when a recent project exists. It exposes explicit Simulate and Build actions and formats board/date on the first metadata line with time on the second so the timestamp cannot clip.
- Removed the obsolete landing caption, `One RTL source / Two execution targets`.

Files:

- `allora-fpga/src/pages/BoardSelect.tsx`
- `allora-fpga/src/pages/welcome/HomeView.tsx`
- `allora-fpga/src/pages/welcome/WelcomeShell.tsx`
- `allora-fpga/src/styles/welcome-landing.css`
- `allora-fpga/public/welcome_ice_molecular.png`
- `allora-fpga/public/welcome_black_ice_molecular.png`

Validated:

- `npm run build`
- `npm run lint`
- Repeated browser visual QA at 1280 × 720 for the Ice landing, product-information panel, compact rail, equal card widths, full-width Pin Mapper action, and shared right alignment.
- Confirmed the production build completes with only the existing bundle-size advisory for the JavaScript chunk over 500 kB.

Known limitations:

- Recent projects do not persist the last execution target, so Continue Project intentionally offers separate Simulate and Build actions instead of guessing.
- The product version is currently displayed as `0.0.0` to match `allora-fpga/package.json`; it is not yet injected from build metadata.
- The documentation action opens the GitHub README and therefore requires network access.
- CSS `cover` positioning necessarily crops portions of the wide artwork in unusually narrow or portrait windows.
- The Ice source render contains intentional depth-of-field bokeh; the app applies no background blur layer.

Next:

- Persist each project's last execution target so Continue Project can offer one primary Resume action.
- Source the displayed version from shared application/build metadata rather than duplicating the package value in the welcome component.

## 2026-09-18 — Refined simulator framing and port discovery

Changed:

- Restyled the Black Ice Simulate/Build switch as a dark segmented control with equally legible inactive states and theme-consistent active treatments.
- Reduced the Virtual FPGA hero into a compact workspace header with quieter lighting, smaller typography, and less visual weight.
- Connected the Peripheral Mapping column width to the resizable dashboard sidebar width so the left and right rails align by default and continue to match after sidebar resizing.
- Added Yosys's `proc` lowering pass before emitting port-discovery JSON, fixing failures for ordinary RTL modules that contain procedural `always` blocks.

Validated:

- `npm run build`
- `npm run lint`
- `cargo test --no-fail-fast`

Known limitations:

- The matching rail width applies at desktop layout sizes; the simulator stacks into one column below 1000px.

## 2026-09-18 — Stabilized and theme-aligned Virtual FPGA workspace

Changed:

- Excluded likely testbench files from Virtual FPGA port discovery and Verilator compilation, preventing valid testbench delay syntax such as `#10` from breaking every interactive simulation project. Testbench sources remain available to the dedicated Testbench workspace.
- Resolved the configured top module from the selected HDL file's module declaration before falling back to its filename, so files and modules no longer have to share the same name.
- Bound the dashboard to the viewport and moved scrolling into its main content surface instead of extending the document.
- Gave the Simulate home Recent Projects card and the Virtual FPGA Peripheral Mapping card fixed-height, internally scrolling content regions.
- Added Black Ice materials, typography, controls, diagnostics, and status styling for the Simulate home and Virtual FPGA workspace so light-theme cards no longer leak into the dark theme.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA of the Simulate home in Ice and Black Ice using the local Vite preview.

Known limitations:

- Browser preview cannot exercise native Tauri file opening or the installed Yosys/Verilator processes; the interactive compile path still needs an end-to-end desktop smoke test with a saved project.
- Testbench detection is intentionally heuristic (filename/module names containing `tb` or `testbench`) to match the existing synthesis and bitstream source-selection behavior.

Next:

- Replace the fixed peripheral bank with a board-builder model driven by discovered ports, and add an embedded waveform/signal-routing view so the Virtual FPGA reads as a purposeful instrument rather than a generic PCB illustration.

## 2026-09-18 — Aligned welcome pane content

Changed:

- Reserved the same three-line description region in both mode panes so their action buttons align even when Build copy wraps further than Simulate copy.
- Made the center signal field absorb remaining space and prevented the feature footers from shrinking or overflowing below the fixed-height panes.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA at the supplied screenshot's approximately 2.4:1 wide, short aspect ratio; both CTAs, signal rows, and feature footers align and remain inside their panes.

## 2026-09-18 — Equalized welcome pane dimensions

Changed:

- Replaced content-dependent minimum heights with identical explicit responsive heights for the Simulate and Build panes.
- Set both panes to fill their equal grid columns, ensuring matching width and height at desktop, compact, stacked, and short-window breakpoints.

Validated:

- `npm run build`
- `npm run lint`

## 2026-09-18 — Smaller frosted welcome panes

Changed:

- Restored the stronger full-pane frosted-glass material used by the first glass welcome revision.
- Reduced each Simulate and Build pane to 80% of its former visual area by scaling width and height proportionally, preserving their aspect ratio, perspective, hover lift, and content hierarchy.
- Applied the same proportional reduction to compact and short-window breakpoints.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA of the Ice landing at 1280 × 720 against the integrated environment bays.

Known limitations:

- The 20% area reduction is implemented as approximately 10.6% less width and height rather than 20% off each dimension.

## 2026-09-18 — Environment-integrated welcome panes

Changed:

- Regenerated the Ice environment around two shallow architectural glass bays, with circuit routes, glass rails, configurable logic, and physical FPGA hardware converging into the interactive pane positions.
- Derived Black Ice from the revised Ice master as a strict lighting and material-grade edit, preserving identical geometry and composition.
- Removed the opaque Virtual Board and build-flow preview boxes from the landing panes.
- Made the pane bodies optically clear with crisp environmental detail, localized text scrims, polished edges, contact shadows, and small signal terminals that intensify with the existing hover lift.
- Preserved the existing pane dimensions, navigation, color palette, directional lighting, responsive behavior, and reduced-motion support.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA of the integrated Ice and Black Ice environments at 1280 × 720.
- Confirmed the background remains sharp and meaningful through both full-size panes.

Known limitations:

- The original `welcome_ice_ai.png` and `welcome_black_ice_ai.png` assets remain available as unreferenced first-pass masters.

Next:

- If more environmental interaction is desired, add a lightweight aligned SVG pulse layer that follows the rendered routes on pane hover.

## 2026-09-18 — AI-authored dual-theme glass welcome

Changed:

- Replaced the landing treatment with two large, slightly tilted optical-glass destination panes while preserving the existing Simulate and Build actions.
- Added AI-authored Ice and Black Ice environment renders. Black Ice was derived from the Ice master as a strict lighting/material-grade edit so camera, geometry, circuitry, chip, landscape, and spacing remain identical.
- Kept all branding, mode copy, actions, feature labels, and focus states as accessible semantic HTML.
- Added layered edge lighting, plausible directional reflections, internal FPGA-grid detail, restrained hover lift, responsive stacking, and reduced-motion behavior.
- Updated the README welcome description and asset map.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA of Ice and Black Ice at 1280 × 720.
- Visual QA of the stacked Black Ice layout at 700 × 900.
- Confirmed Simulate opens the Virtual FPGA home and Build opens the physical board catalog.
- Confirmed Settings switches between Ice and Black Ice artwork and tuned glass materials.

Known limitations:

- The generated background masters are 1672 × 941; CSS cover scaling is used for larger and differently proportioned windows.
- The legacy WebGL welcome scene remains in the source tree but is no longer loaded by the home screen.

Next:

- Consider removing the unused welcome WebGL scene and its rendering dependencies in a separate cleanup after confirming they have no other consumers.

## 2026-09-16 — Professional Ice hero and two-theme product palette

Changed:

- Reworked the Blender-authored Ice scene so the rendered circuitry sits below the semantic landing copy, with cleaner negative space in both text fields.
- Added a glass FPGA plinth, pearl inset, cyan/violet edge rails, restrained luminous halos, polished data pearls, and balanced cyan/violet studio softboxes while preserving the Frutiger Aero direction.
- Kept the existing 2560 × 1440 Cycles render configuration unchanged and replaced `allora-fpga/public/welcome2_ice.png` with the new render.
- Added the editable source at `design/welcome_ice_professional.blend` and a standalone render at `design/welcome_ice_professional.png`.
- Reduced the supported theme model and Settings selector to Ice and Black Ice. Persisted Light, Solar, or Dark preferences now migrate to Ice, and their CSS theme bundles are no longer imported.

Validated:

- Reviewed the final Blender Render result at full composition scale.
- Confirmed the exported PNG is 2560 × 1440 and only the Ice landing asset was replaced.
- Visual QA of the Ice landing in the local app; confirmed the text fields align with the quiet upper panels and the FPGA hero begins below the feature rows.
- Confirmed the Theme selector exposes exactly Ice and Black Ice.
- `npm run build`
- `npm run lint`

Known limitations:

- Black Ice intentionally retains its existing CSS landing treatment and was not changed.
- Legacy Light, Solar, and Dark stylesheet files remain in the source tree for historical reference, but are unreachable and excluded from the application bundle.

Next:

- Add a Black Ice Blender composition only when its visual direction is ready to be designed independently.

## 2026-09-16 — Blender-backed Ice welcome screen

Changed:

- Replaced the Ice landing background with the text-free 2560 × 1440 Blender render at `allora-fpga/public/welcome2_ice.png`.
- Kept Simulate and Build headings, descriptions, actions, and feature labels as accessible HTML controls over the render.
- Completely removed the fractured-glass implementation: duplicated decorative chooser markup, pane polygons, SVG seams, prism highlights, pointer proximity calculations, and pane-transform CSS.
- Limited the Blender background to the Ice theme. Light, Solar, Dark, and Black Ice retain their existing CSS backgrounds.
- Removed the oversized virtual-board and build-flow previews from the Ice landing so they no longer cover the rendered FPGA; the nested Simulate and Build experiences remain unchanged.
- Scaled the sharp render to 92% of the welcome area and layered it over a blurred full-bleed copy. Independent horizontal and vertical masks feather every edge to transparency so the artwork blends into corners and the navigation rail without a visible rectangle.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA of the Ice landing at a 1280 × 720 desktop viewport.
- Confirmed the full central FPGA remains visible, the text stays inside the two upper glass fields, and all four image edges fade into the surrounding surface.
- Confirmed no fracture-layer identifiers remain under `allora-fpga/src`.

Known limitations:

- Only Ice has a Blender-rendered landing background. Matching source renders are still needed for Light, Solar, Dark, and Black Ice.
- Signal routes are static in the PNG. The planned hover-driven pulse effect still needs an aligned SVG overlay with reduced-motion behavior.
- The editable Blender source currently lives outside the repository; only the exported Ice PNG is versioned with the app.

Next:

- Render theme-matched variants from the same Blender composition and add explicit theme-to-asset mappings.
- Add responsive SVG signal paths aligned to the rendered traces, pulsing from the central FPGA toward the hovered Simulate or Build side.

## 2026-09-15 — Full-viewport glass welcome

Changed:

- Reworked the initial Simulate / Build chooser into a full-viewport two-panel composition that visually continues beneath the navigation rail.
- Added fractured-glass geometry, layered translucency, and a lightweight pointer-following highlight with CSS instead of adding a Three.js/WebGL dependency.
- Added dedicated landing palettes for Light, Ice, Solar, Dark, and Black Ice while leaving the nested Simulate and Build screens unchanged.
- Preserved keyboard focus treatment, responsive stacking, and reduced-motion behavior.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA of Ice and Dark at a 1200 × 725 desktop viewport.
- Confirmed the Build selection returns to the existing board catalog and the back control restores the chooser.

Known limitations:

- The attached reference was a still image, so motion timing from the original video could not be inspected directly.

Next:

- If the original video becomes available, compare its motion language and tune panel transitions or glass highlights to match.

## 2026-09-15 — Interactive glass seams

Changed:

- Replaced the decorative clipped layers with a visible SVG pane-and-seam network based on the reference composition.
- Added proximity-based pane motion near cracks and outer edges, plus a localized cyan/violet prism highlight along the nearby glass edge.
- Reduced the Black Ice cursor spotlight from a broad white wash to a compact, low-opacity blue-white glow.
- Disabled pane motion alongside the cursor glow when reduced motion is requested.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA of the resting crack network in Black Ice at a 1280 × 720 desktop viewport.
- Confirmed the proximity calculations update pane offsets and prism intensity independently from the compact cursor spotlight.

## 2026-09-15 — Separated moving glass panes

Changed:

- Widened the fracture channels with a theme-aware recessed gap beneath each pane edge.
- Increased and corrected pane displacement so all four pieces visibly separate near a seam, including around the center intersection.
- Raised the fracture layer above headings, copy, previews, and controls so cracks visibly interrupt any content they cross, matching the reference's broken-glass composition.
- Further reduced the Black Ice pointer light to a faint 78px blue highlight while preserving the localized prism response.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA in Ice and Black Ice at a 1280 × 720 desktop viewport, including seam interruption across headings, body copy, the virtual board, and the build-flow preview.

## 2026-09-15 — Video-matched deforming glass mesh

Changed:

- Reviewed the supplied nine-second source recording in QuickTime rather than inferring behavior from still screenshots.
- Replaced rigid pane translation with a cursor-driven deforming mesh: shared interior vertices bend toward the pointer, while perimeter connections slide modestly along the card edges.
- Reduced the oversized dark channels to narrow 3.6px beveled seams matching the recording, while keeping the mesh above content so moving edges interrupt typography and previews.
- Reduced the prism intensity and retained the very dim Black Ice cursor light.

Validated:

- `npm run build`
- `npm run lint`
- Compared source frames at 0, 2, 4, 6, and 8 seconds in QuickTime.
- Visual QA of cursor-driven deformation at multiple points in Ice and Black Ice at a 1280 × 720 viewport.
- Confirmed reduced-motion preference holds the mesh at its resting geometry and suppresses the prism response.

## 2026-09-15 — Fixed seams and independent 3D panes

Changed:

- Corrected the interaction model after user feedback: seam geometry is fixed while individual clipped glass surfaces tilt, lift, scale, and drift independently in 3D under the cursor.
- Added distinct five-pane fracture maps for Simulate and Build instead of mirroring the same pattern on both halves.
- Removed the outer panel borders, one-pixel grid divider, and SVG perimeter strokes so only internal seams remain.
- Softened internal cracks into narrow recessed channels with fine highlight rims across every theme.
- Preserved content interruption at the seams while using translucent pane overlays and backdrop filtering for depth and refraction.

Validated:

- `npm run build`
- `npm run lint`
- Visual QA of both distinct resting fracture maps in Ice and Black Ice at a 1280 × 720 viewport.
- Verified the hovered pane receives an independent 3D matrix transform, 18px depth lift, and localized drop shadow while seam paths remain unchanged.
- Removed backdrop brightness after Black Ice QA exposed compounded bloom across the upper panes.

## 2026-09-15 — Separate Simulate and Build experiences

Changed:

- Replaced the board-first welcome screen with two equal primary choices: a colorful **Simulate / Virtual FPGA** path and a focused **Build / Physical FPGA** path.
- Moved board selection, pin mapping language, and the Yosys → nextpnr flow behind Build. Simulate now has its own visual home with the interactive virtual-board motif, project opening, and recent projects.
- Project opening carries the chosen execution target into the workspace. Simulate opens directly on Virtual FPGA; Build opens on Code.
- Added a project-level Simulate/Build switch. Simulation navigation contains Code, Virtual, Testbench, and Health; Build navigation contains Code, Board, Synthesis, Pins, Health, Bitstream, Program, and Serial.
- The Home rail button now resets nested Simulate/Build navigation to the two-choice landing page.

Validated:

- `npm run build`
- Visual QA of the two-card landing and standalone Simulate home at desktop dimensions.

Known limitations:

- Creating a brand-new project still starts from the Build board catalog because the current project format requires a physical `boardId`. Simulate can open any existing Allora project without using its physical toolchain.

Next:

- Add a board-agnostic “New Simulation Project” flow and make physical board selection optional until the user switches to Build.

## Update template

```text
## YYYY-MM-DD — Short title

Changed:
- User-visible and architectural changes.

Validated:
- Exact builds, tests, or manual flows run.

Known limitations:
- Honest remaining gaps or risks.

Next:
- The most useful follow-up work.
```

## 2026-09-19 — Shared simulator-quality waveform

Changed:

- Extracted the Virtual FPGA live trace into `SignalWaveformPanel`, a shared signal-picker and SVG step-wave renderer.
- Replaced the Testbench/build waveform's legacy segmented timeline and zoom toolbar with that shared renderer.
- VCD traces now use the same selectable signal chips, stacked color coding, bus-value labels, cursor, end-time readout, responsive behavior, and empty state as Virtual FPGA.
- Preserved the existing Icarus VCD parser and physical-board playback beneath the upgraded waveform.

Validated:

- `npm run build`
- `npm run lint`
- `npm run tauri dev`
- ButterStick Verilator scenario: compiled `uart_pwm_controller`, ran to 70 µs, captured 15 snapshots, and observed propagated clock/UART output state changes.
- ButterStick Icarus scenario: generated a 4.102455 ms VCD; confirmed target channel 2 received `0x96`, `pwm_out` became nonzero, and `error_led` asserted then cleared.

Known limitations:

- The existing UART-response assertions in `pwmcontroller_tb.v` still report 24 response-byte failures even though its target, PWM, and error propagation assertions pass. This predates and is independent of the waveform UI replacement.

Next:

- Diagnose the ButterStick UART response sampling mismatch separately from the waveform work.

## 2026-09-19 — Clock waveform edge capture

Changed:

- Fixed the Virtual FPGA clock trace aliasing bug where UI snapshots were taken only after whole batches of cycles and therefore always showed one clock phase.
- Added bounded half-cycle trace capture to the Verilator harness and step response. Each run/step now returns real rising and falling edge samples while retaining batched simulator performance.
- Clock cycles now finish low, the rolling waveform window normalizes to its retained sample range, and the selected clock frequency is shown alongside the live trace.
- Kept the Testbench/build path on its VCD edge data; no equivalent flat-clock bug was present there.

Validated:

- Verilator harness test captured eight alternating `1, 0` clock samples for four cycles, ended low, and advanced the RTL counter from 1 to 5.
- Existing ButterStick build VCD contains 820,492 alternating clock edge records.
- `npm run build`
- `npm run lint`
- `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast`
- `npm run tauri dev` compiled, launched, and accepted the frontend update through Vite HMR.

## 2026-09-19 — Visible input/reset pulses and compile feedback

Changed:

- Slowed continuous Run from 250 to 1 cycle per refresh so every clock setting exposes each edge pair separately and interactive FPGA controls occupy meaningful waveform width.
- Preserved distinct same-timestamp input values as ordered waveform samples, preventing quick button/reset press-and-release events from replacing each other.
- Changed toolbar Reset to return and display the active reset state, clock edges while reset is asserted, and the inactive state.
- Added an animated `Compiling…` state directly inside Compile & Start and yielded two browser paint frames before invoking Verilator so feedback appears before compilation work begins.

Validated:

- `npm run build`
- `npm run lint`
- `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast` (4 passed)
- `npm run tauri dev` launched against the configured port with the updated frontend and Rust backend.

## 2026-09-15 — Virtual FPGA V0.1 foundation

Changed:

- Added a first-class Virtual workspace while retaining Board, Testbench, Synthesis, Pins, Bitstream, Program, and Serial workspaces.
- Added typed virtual peripherals (`clock`, `reset`, `button`, `switch`, `led`) and scalar/vector-bit mappings persisted under `simulation` in `allora-project.json` through the existing project autosave path.
- Added Yosys JSON top-port discovery. This avoids maintaining a second HDL parser and returns authoritative direction/width information after elaboration.
- Added a Rust-managed Verilator engine. It writes isolated sources, generates a C++ harness, compiles the selected top module, keeps the native model alive behind Tauri commands, and supports set-input, step, reset, snapshot, stop, simulated time, and VCD capture.
- Added a polished interactive board, simulation controls, live LEDs, momentary buttons, toggle switches, mapping controls, tool readiness, and a binary/hex/decimal top-level signal inspector.
- Added Verilator readiness to Build Health and an end-to-end virtual LED counter example.
- Replaced the starter README with product, architecture, setup, workflow, project format, and limitation documentation.

Validated:

- `npm run build`
- `npm run lint`
- `cargo test --no-fail-fast`
- Real Yosys discovery test against a counter module.
- Real Verilator lifecycle test: compile, reset, set input, clock step, and verify the RTL-produced LED value.
- Existing baseline was clean for TypeScript/Vite and Rust before implementation; physical build/program commands were not altered.

Known limitations:

- Interactive V0.1 supports Verilog/SystemVerilog, top-level input/output ports up to 64 bits, and no `inout` ports.
- Run mode is intentionally a 10 Hz UI poll with 250 simulated clock cycles per poll. This is responsive and deterministic, not real-time emulation.
- VCD data is generated by Verilator, but the existing Testbench waveform view does not yet open the live Virtual FPGA trace automatically.
- Changing RTL or mappings requires stopping and recompiling the active simulation.

Next:

- Add internal-signal selection and route Virtual FPGA VCD artifacts into the existing waveform viewer.
- Add configurable batch size/run speed and active-low reset control in the UI.
- Add a VHDL-capable interactive engine behind the simulator abstraction.
- Exercise one supported physical board end to end on connected hardware as a release smoke test.
