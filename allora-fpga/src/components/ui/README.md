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
  into that same material; `ui-icon-button` supplies a shared 32px target.
- `ui-compact-button-group` is the shared control variant for tightly spaced
  actions, tabs, and toolbars: transparent backgrounds and borders at rest,
  separated by short vertical dividers. Enabled controls reveal their material,
  border, and animation on hover. Shared sizing lives in controls.css; only
  explorer groups retain custom density. Selected text, keyboard focus, and
  reduced-motion preferences remain intact.
  Use this variant explicitly rather than guessing proximity from CSS geometry.
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
