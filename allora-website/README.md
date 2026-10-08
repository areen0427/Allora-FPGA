# Allora website

This is a static website. Its HTML, styles, scripts, and product captures are
served directly; it does not require the desktop app's npm build.

From the repository root, start a local preview:

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory allora-website
```

Open `http://127.0.0.1:4174`. Check Ice and Black Ice at desktop and mobile
widths, keyboard navigation, screenshot previews, workflow tabs, and board
search. Stop the preview server when finished.

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
The current tool and background captures, sample-project results, and image
processing are recorded in
[`WEBSITE-CAPTURES-2026-10-07.md`](../marketing/assets/WEBSITE-CAPTURES-2026-10-07.md).

The homepage keeps the original layout, copy, and Ice / Black Ice styling, with
Refraction behind the opening screen. The Allora Link and background previews
reuse the existing tour components. Product images retain their native aspect
ratios; the two original font families are served locally with their licenses.

GitHub Pages deploys this directory through
[`deploy-website.yml`](../.github/workflows/deploy-website.yml).
