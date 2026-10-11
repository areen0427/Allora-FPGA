# Design system consistency audit

Audited the supported Ice and Black Ice themes, active screen CSS, all 63 JSX
files' inline style attributes, reusable controls, and repeated navigation,
project-list, setup, and modal behavior. Historical Dark/Light/Solar styles are
not imported by the application and are not supported theme choices.

## What belongs in shared styling

| Value or behavior | Owner | Result |
| --- | --- | --- |
| Neutral text and icons | `styles/tokens.css` | Main, muted, soft, and accent text inherit theme values. Black Ice uses near-white and pale blue. Icons inherit `currentColor`. |
| Action materials and interaction | `styles/controls.css` | Primary/secondary actions share fill, border, shadow, hover, disabled state, and focus. Older named actions remain aliases. |
| Ordinary button geometry | Shared radius tokens | Buttons inherit rounding even without a variant class; existing ordinary control radii use the shared scale. Screen styles retain compact sizing. |
| Selected toggles | `aria-pressed` plus shared active material | Pin-mapper modes retain selection without inline fills suppressing hover or disabled styling. |
| Success, warning, and error UI | Paired semantic tokens | Text, background, and border adapt together. Actual error icons no longer inherit a blanket green provider-icon rule. |
| Workspace navigation | `WorkspaceDock` | Chat, Build, and Simulate use the same component and navigation buttons. |
| Recent projects | `RecentProjectsCard` | Every destination shows three projects, expands to at most five, and shares open, keyboard, and remove behavior. |
| Landing sidebar scrolling | `welcome-project-sidebar` | Sidebars stay sticky during page scrolling; recent projects share that flow. Narrow screens return to normal flow. |
| Setup folder selection | `useProjectLocation` | Setup routes retain the same selection behavior and shared action variants. |
| Blocking overlay keyboard behavior | `useModalFocus` | Settings, variants, GitHub publishing, and board-pin dialogs share focus entry, Tab containment, Escape, and focus restoration. |

## Hardcoding decisions

| Hardcoded category | Decision | Reason |
| --- | --- | --- |
| Ice-only neutral fills, foregrounds, borders, and native-control accents | Replace with tokens | These caused theme leaks and duplicate material definitions. |
| Independent ordinary action radii and disabled/hover rules | Replace with shared rules | Reused actions should have the same geometry and feedback. |
| Root theme palette values | Keep in token definitions | A theme needs concrete colors; consuming screens should inherit them. |
| Theme preview thumbnails and background samples | Keep their own palette | Both theme samples are shown together, independently of the active theme. |
| Physical PCB, USB, silkscreen, LED, button, and switch artwork | Keep physical colors and shapes | These depict hardware and its input/output state. |
| Signal traces, schematic categories, memory/audio plots, quota bands, and syntax colors | Keep meaningful data palettes | Color distinguishes data categories or values. Neutral UI labels still follow the theme. |
| Monaco theme definitions | Keep explicit palettes | Monaco requires its own concrete theme registration. |
| Terminal output with a deliberately dark canvas | Keep a readable paired palette | Its data display remains dark in both themes. |
| Screen layout, responsive breakpoints, SVG geometry, circles/pills, and joined edges | Keep local geometry | These describe layout or a specific object, not ordinary button material. |
| Decorative background art and glass highlights | Keep authored theme artwork | They describe the theme's appearance; reusable controls and text still inherit shared tokens. |

The old inline style-substring compatibility shim was removed after the JSX
audit. Matching a color anywhere in a style attribute could change an unrelated
background, border, or text property. Neutral inline UI styles now consume tokens
directly. Broad nested-text overrides were also removed so muted and semantic
labels keep their intended roles.

Background tokens can contain gradients. The chat context tooltip now uses a
valid background token directly; SVG schematic paint uses a solid color token.
Native selects retain their arrow layer rather than having it erased by a
theme-specific background shorthand.

Native Memory Studio dialogs retain `showModal()` focus/cancel behavior. Anchored
usage, provider, and model popovers remain non-modal. The shared modal hook yields
to native dialogs and closes only the top custom overlay.

## Regression coverage

`npm test`, `npm run lint`, and `npm run build` run from `allora-fpga`.
The theme tests scan JSX inline material for fixed Ice colors and require at
least 4.5:1 contrast for main, muted, accent, and semantic text on their paired
theme surfaces. Recent-project tests cover expansion, limits, keyboard opening,
and independent removal. Modal tests cover focus entry/restoration, disabled and
hidden controls, Tab wrapping, nested Escape, native dialogs, and removed openers.

These checks complement focused visual verification; they do not claim an
exhaustive visual run through every app flow or every background image.

This pass completed with 84 tests, lint, production build, CSS parsing, and diff
checks passing. A focused ADE-browser check confirmed Black Ice Settings text,
icons, rounded controls, and Escape behavior. Native Bitstream was not visually
exercised: project creation in the browser reports that Tauri is unavailable.
