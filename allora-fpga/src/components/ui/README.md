The application uses React + TypeScript, Vite, and custom theme CSS. General
components live in `src/components`, dashboard components in
`src/pages/dashboard`, and styles in `src/styles`, imported by `src/App.css`.
`src/index.css` contains global fonts and resets. `lucide-react` is already
installed; the dock retains the existing SVG components and icons.

`src/components/ui` is the source-root equivalent of `/components/ui`. Keeping
reusable UI primitives here gives future shadcn components a predictable home
without mixing them with dashboard business logic. The dock uses the existing
CSS and relative imports, so it works without Tailwind or an `@` alias.

For an optional full Tailwind/shadcn setup, run commands from `allora-fpga`:

1. Install `npm install tailwindcss @tailwindcss/vite`.
2. Import `tailwindcss` from `@tailwindcss/vite` in `vite.config.ts` and add
   `tailwindcss()` to the existing plugins array, retaining React and demoBridge.
3. Add `@import "tailwindcss";` to `src/index.css`, retaining the existing CSS.
   Review Tailwind's reset against the app's existing styles and themes.
4. Add `"paths": { "@/*": ["./src/*"] }` under `compilerOptions` in both
   `tsconfig.json` and `tsconfig.app.json`. In Vite, add
   `resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } }`
   with `fileURLToPath` imported from `node:url`.
5. Run `npx shadcn@latest init`, selecting `src/index.css` and aliases
   `@/components`, `@/components/ui`, and `@/lib/utils`. Review generated theme
   styles to preserve Allora's palette. TypeScript is already configured.
6. Run `npm run build` and review both Ice and Black Ice themes.

See the [shadcn Vite guide](https://ui.shadcn.com/docs/installation/vite) and
[Tailwind Vite guide](https://tailwindcss.com/docs/installation/using-vite).
