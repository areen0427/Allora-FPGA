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
- Screen styles own layout and size. Use `--ui-accent-text` for accent text,
  `--ui-control-bg` for neutral controls, and `--ui-control-fill` when a select
  needs an arrow layered above its fill. Reserve status colors for actual status.
- `styles/button-glass.css` adds material without owning action colors.
  `data-glass="off"` opts precise/custom controls out of that material.
- `styles/accessibility.css` applies both the OS and saved reduced-motion
  preference across screens. Use `--ui-motion-fast` and `--ui-lift-subtle` for
  ordinary interactions so those preferences work automatically.
- `styles/themes/inline-compat.css` supports older inline colors. New components
  should use tokens/classes instead of adding style-substring overrides.

`src/index.css` contains fonts and global resets. Shared project-folder selection
lives in `src/hooks/useProjectLocation.ts`; each setup screen owns its project
creation and labels. The displayed app version comes from `package.json`, while
schema/serialization versions remain independent.

Run `npm test`, `npm run lint`, and `npm run build` from `allora-fpga`.
