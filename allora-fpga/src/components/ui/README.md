The application uses React + TypeScript, Vite, and custom theme CSS. General
components live in `src/components`, shared UI primitives in `src/components/ui`,
and dashboard components in `src/pages/dashboard`. The dock retains its existing
SVG components and icons; `lucide-react` is available for other controls.

Shared styling is imported by `src/App.css`:

- `styles/tokens.css` owns colors, surfaces, radii, focus, and motion for Ice and
  Black Ice. Tokens live on the document root so dialogs and viewer windows
  inherit the same values.
- `styles/controls.css` owns primary/secondary action material, hover, disabled,
  and keyboard-focus behavior. Existing action classes are aliases to those
  variants. New buttons can use `ui-button ui-button-primary` or
  `ui-button ui-button-secondary`.
- Focusable data rows can use `ui-selectable-row` for a pointer cursor and a
  static, theme-aware `:focus-visible` outline. It adds no button or glass
  material and leaves table semantics intact; the owning screen supplies
  `tabIndex` and row interaction behavior.
  A roving row tab stop must include ArrowUp/ArrowDown and Home/End navigation
  so every row can be reached. Focus and selection stay synchronized; nested
  actions retain their independent key/click behavior.
- Dock buttons use `ui-dock-button` with `ui-dock-icon`. This shared variant
  keeps icons borderless in every state, reveals the glass sheen only on hover,
  and sizes SVGs with `--ui-dock-icon-size`. Rail layout stays local.
- Paired toggles use `ui-button-group`: the container has no material or frame;
  individual buttons share the compact group behavior below.
- Committing actions (Generate, Program, Done, and other primary actions) use
  `ui-action-button`: a persistent theme-blue border with glass hover
  animation and the shared subtle lift, without a changing fill, including inside
  compact groups. Reduced-motion preferences suppress the lift.
- Add `ui-selection-group` to a paired group when the selected control should
  retain its theme-aware liquid-glass edge at rest. Use `aria-pressed` or
  `aria-selected` for state. `ui-glass-control` opts an otherwise flat element
  into that same material; `ui-icon-button` supplies a shared 34px target. Add
  `ui-icon-button-hover` for hover-only liquid-glass edges (Collapse, Add, Import).
  Text controls use `ui-hover-button` for the same material without icon sizing.
- `ui-compact-button-group` is the shared control variant for tightly spaced
  actions, tabs, and toolbars: transparent backgrounds and borders at rest,
  separated by short vertical dividers. Enabled controls reveal their material,
  border, and animation on hover. Shared sizing lives in controls.css; only
  explorer groups retain custom density. Selected text, keyboard focus, and
  reduced-motion preferences remain intact.
  `useAutomaticCompactGroups` also applies this shared variant to three or more
  consecutive visible sibling controls in flex/grid rows, with gaps of at most
  `--ui-compact-auto-distance` (12px). `--ui-compact-auto-min-count` defaults to 3.
  It reevaluates after DOM/layout changes, splits wrapped rows, preserves
  explicit groups and primary actions, and excludes dock, file-tree, card, and
  physical switch controls. `data-ui-compact="off"` opts a container out.
  Two-button groups can still use the explicit variant.
  Pin Mapping resource grids combine compact and selection groups: only
  assignable entries are buttons, with hover-only borders and a persistent
  selected edge. Non-clickable entries remain plain data. Keep vertical dividers
  inside multi-column rows, never on the outer left/right edges; add a short
  `ui-control-divider-below` child beneath entries. Single-entry/stacked rows use
  only the separator underneath. Preserve the selected resource after assignment.
  Read-only compact counters use
  `ui-metric`: no control surface or border, with a short separator between
  adjacent metrics. Do not apply it to clickable items.
- Screen styles own layout and size. Use `--ui-accent-text` for accent text,
  `--ui-control-bg` for neutral controls, and `--ui-control-fill` when a select
  needs an arrow layered above its fill. Reserve status colors for actual status.
- Neutral text and icons use `--ui-text`, `--ui-text-muted`, or
  `--ui-text-soft`; active navigation and accents use `--ui-accent-text`.
  Black Ice uses near-white text and a pale, low-saturation blue accent.
  Icons inherit `currentColor`; avoid fixed Ice foregrounds in CSS, inline
  styles, and SVG labels. White on primary buttons uses `--ui-primary-text`.
  Keep fixed colors only for semantic status, code/data visualization, and
  physical-board artwork where the color conveys meaning.
- `styles/button-glass.css` adds material without owning action colors.
  `data-glass="off"` opts precise/custom controls out of that material.
- `styles/accessibility.css` applies both the OS and saved reduced-motion
  preference across screens. Use `--ui-motion-fast` and `--ui-lift-subtle` for
  ordinary interactions so those preferences work automatically.
- Ordinary buttons inherit a shared radius even before they use an action
  variant. The `ui-button` base has low specificity so screen-owned sizing and
  dense controls can override it. Selected toggles use `aria-pressed`; disabled
  controls share their cursor, opacity, and keyboard focus behavior.
- Status text and surfaces use paired `--ui-success-*`, `--ui-warning-*`, and
  `--ui-error-*` tokens so the foreground remains readable in either theme.
  Background tokens may contain gradients: use `--ui-panel` or
  `--ui-control-solid` for SVG paint and color-mix inputs.
- Inline neutral styles use tokens directly. The old style-substring theme shim
  has been removed; it could change a background when only text matched.

Shared components own their behavior as well as their material. Recent-project
cards show three projects, expand to at most five, and retain the same open,
keyboard, and remove actions on every landing route. Landing project sidebars
use `welcome-project-sidebar` for the same sticky page-scroll behavior; they
return to normal flow on narrow screens. Avoid per-screen expansion flags or
nested recent-project scroll areas.

`src/index.css` contains fonts and global resets. Shared project-folder selection
lives in `src/hooks/useProjectLocation.ts`; each setup screen owns its project
creation and labels. The displayed app version comes from `package.json`, while
schema/serialization versions remain independent.

Run `npm test`, `npm run lint`, and `npm run build` from `allora-fpga`.

The [consistency audit](../../../../docs/DESIGN_SYSTEM_AUDIT.md) records migrated
controls and behaviors, intentional hardcoded values, and regression coverage.

**Persistent user preference:** “popup” means the Product Information pattern
unless the user explicitly specifies otherwise: a compact glass panel anchored
to its trigger, the same unfold animation, and outside-click/Escape dismissal,
without dimming or blurring the page. Honor both reduced-motion preferences.
Use the Settings modal treatment only when explicitly requested.

Popup dismissal is shared behavior: do not render an X close button in popovers
or dialogs. Clicking outside dismisses the popup; Escape remains available for
keyboard users. Blocking overlays use `useModalFocus`, which handles outside
pointer dismissal, topmost-only Escape, focus trapping, and restoration. Native
dialogs must dismiss on backdrop clicks as well. Keep explicit Cancel/Done
choices where they are part of a workflow. Search-clear, file-tab close, and
inline message dismissal controls are separate from popup dismissal.

Floating surfaces use `--ui-popup-bg` for the shared theme-aware glass fill,
`--ui-border-control` for the edge, and `--ui-popup-shadow` for the halo. Avoid
popup-specific theme palettes; compact layouts belong to the popup component.

Standard Build/Simulate page headings use `InfoCard pageTitle` (or
`ui-workspace-panel` with `ui-workspace-title` for another container). Shared
workspace tokens own the Synthesis-aligned 20px inset, 24px title, and 22px
content gap. Sidebar/subsection cards keep their smaller heading hierarchy.
Custom editor, chat, workbench, and studio headers retain their own layouts.
The first section below a page title uses Testbench's 22px gap, with no additional
top margin. `ui-workspace-header` applies the same spacing to compound headers;
grid layouts declare `--ui-workspace-row-gap` so their gap is counted once.
`ui-button-group-flush-start` aligns a group's first text label with the page's
content edge while retaining the button's padding and selected/hover border.

All workspace titles use `WorkspaceTitle` with the section's dock icon and
canonical name. Icons occupy equal 24px header slots; the entire header starts
at the shared workspace inset, aligned with content. Tool headers omit kicker
labels. Dock SVG slots use the shared icon-size token without wide-icon cases.

`ui-borderless-workspace` is the shared workspace layout variant that removes structural
card/section frames while preserving interactive control and status styling.
`ui-workspace-dot-grid` adds a faint theme-aware dot canvas using the shared grid
color and spacing tokens. The Dashboard main area supplies both variants to all workspace pages.
The welcome Pin Mapper also uses both variants for its work column beside the
board search, including its empty state; pin data surfaces keep their frames.
`ui-workspace-framed` preserves normal card borders/material within a subsection,
used by supporting side panels on Testbench, Synthesis, Bitstream, Pin Mapping,
Programming, Serial, and the design tools. `ui-workspace-support` supplies the
shared framed material for tool palettes/inspectors. Dialogs and popovers are
excluded from the borderless canvas rules.

Supporting right panels use `ui-workspace-columns` / `ui-workspace-split` and
`ui-workspace-aside`, with the shared 205px Synthesis reference width. Section
headings use the 16px title and 14px subheading tokens; page titles remain 24px.
Introductory page subtitles are omitted. At narrow viewport widths, page side
panels move below the main area.

Build Health is Bitstream's default tab; Generate Bitstream switches to Build Log.
Build Preflight uses its scrollable sidebar layout in Bitstream's right column.
Serial Monitor lives in Programming's Program / Serial Monitor tabs. Both tools
have embedded layouts; Health scrolls within the output area, and switching
Programming tabs keeps the serial monitor mounted so a connection stays open.
Legacy Health/Serial destinations resolve to their owning workspace and tab.

The editor uses an open canvas with its gutter aligned to the workspace inset.
`ui-workspace-soft-edges` applies a pointer-transparent, theme-aware blur/fade
at the left, right, and bottom of a reading surface; shared edge tokens control
its width and blur. Tab controls keep their rounded shape and hover close affordance.
`ui-workspace-soft-code-edges` targets only the right and bottom of Monaco's
scrolling code viewport, keeping the start of each line and the gutter clear.

Peripheral Workbench and Register Builder retain their framed tool layouts;
Memory Asset Studio uses the open workspace canvas. Passive validation messages
are plain text; actionable messages use `ui-text-action` without glass borders.
File context menus use `ui-context-menu` / `ui-menu-item` for compact popup sizing.

Build and simulation share one workspace and dock, including physical-board and
board-free projects. Virtual FPGA follows Register Builder; no execution-target
switch gates navigation. Saved-project execution-target fields remain compatible.
Welcome groups are Workspace (Build) and Design Tools, led by AI Design Studio.
The supplied studio SVG is shared by its welcome entry, dock button, and title.
