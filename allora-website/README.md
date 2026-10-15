# Allora website

This is a static website. Its HTML, styles, scripts, and product captures are
served directly; it does not require the desktop app's npm build.

From the repository root, start a local preview:

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory allora-website
```

Open `http://127.0.0.1:4174`. Check Ice and Black Ice at desktop and mobile
widths, keyboard navigation, screenshot previews, workspace and design-tool
tabs, and board search. Stop the preview server when finished.

The shared interactions live in `site.js`. Check its syntax after changing
themes, tab navigation, image previews, or the board comparison:

```sh
node --check allora-website/site.js
```

## Page architecture

The homepage keeps the original RTL, Virtual Simulator, and FPGA pipeline
headline, with native AI Design Studio introduced in the opening copy and
capture. Dedicated AI and GitHub sections follow alongside the unified FPGA
workflow. The workspace tour covers Editor,
Testbench, Synthesis, Pin Mapping, Bitstream, Program, and Virtual FPGA. Build
Health belongs inside Bitstream; Serial Monitor belongs inside Program. The
Allora Link tour covers Peripheral Workbench, Memory Asset Studio, and Register
Builder alongside the same project dock.

The theme gallery uses the current Editor and Home captures. Shared project
files, visible tool output, and independent virtual and physical mappings are
explained in the workflow and workspace sections. Board comparison and the
catalog sit immediately before download.

Keep the original Ice / Black Ice materials, cool accents, locally served font
families, and Refraction hero background consistent. Project work uses one
workspace; simulation and building are operations within it, rather than
separate app modes. Native Codex can act through Allora's project and FPGA tools;
avoid implying unrestricted app or computer control. Account sign-in and the
relevant FPGA toolchains are still required, and hardware programming requires
target confirmation.

## Board catalog

The website derives its catalog from the desktop app's board definitions and
capability checks. Regenerate it after changes to those definitions:

```sh
node allora-website/generate-boards.mjs
node --check allora-website/generate-boards.mjs
node --check allora-website/boards-data.js
git diff -- allora-website/generate-boards.mjs allora-website/boards-data.js
```

The generator includes every build-supported and pin-mapping-only catalog
entry. Counts describe catalog entries; a board entry may contain multiple
hardware variants. Build support does not establish physical programming
support. Silicon resource figures are inferred only for recognized part
numbers; unknown parts leave those fields empty.

Keep screenshots truthful to the native app and identify illustrative diagrams
as illustrations. The capture workflow is documented in
[`marketing/README.md`](../marketing/README.md).
The refreshed unified workspace, AI, GitHub, and design-tool captures are
recorded in
[`WEBSITE-CAPTURES-2026-10-14.md`](../marketing/assets/WEBSITE-CAPTURES-2026-10-14.md).
The earlier tool and background captures, sample-project results, and image
processing remain documented in
[`WEBSITE-CAPTURES-2026-10-07.md`](../marketing/assets/WEBSITE-CAPTURES-2026-10-07.md).

Product images retain their native aspect ratios. Refresh both theme variants
when the app layout changes and keep captions clear about empty states or
results that a capture does not demonstrate. The two original font families
are served locally with their licenses.

GitHub Pages deploys this directory through
[`deploy-website.yml`](../.github/workflows/deploy-website.yml).
