# Website captures — 14 October 2026

This refresh shows the real Allora Tauri application after the unified
workspace redesign. The website keeps the user's original hero headline and
adds the native Codex AI introduction. AI Design Studio and GitHub lead the
page; the workspace tour includes Health inside Bitstream and Serial Monitor
inside Program. The Allora Link covers the three connected design tools, and
board comparison sits immediately before download. See the current page
architecture in [`allora-website/README.md`](../../allora-website/README.md).

The four subjects marked **pending** below have not yet been confirmed as
completed fullscreen captures. Their earlier assets must not be treated as
evidence of this refresh until that checklist is completed.

## Capture and processing

- All final exports are native 2560 × 1440 fullscreen screenshots from ADE's
  lane-owned private Mac Desktop, display 8. The capture does not use the user's
  screen, windows, or pointer.
- The task-owned app is `com.allora.marketing.website20261014`, launched on the
  isolated development origin `http://127.0.0.1:5178`. Working project copies,
  raw PNGs, helper scripts, and the operation journal are kept under the ignored
  `marketing/.cache/website-2026-10-14/` directory. Production source and normal
  app storage are unchanged.
- Start with a resizable window, park it on the private display, and enter native
  fullscreen with Control–Command–F. Confirm the final display and application
  state before capture. An app initially configured as fullscreen was released
  by macOS Spaces; no captures outside the private display from that attempt
  are used.
- Initial 1440 × 960 window captures were discarded and replaced. Keep the whole
  fullscreen frame: no titlebar crop, resizing, rotation, perspective transform,
  or UI repainting.
- `ade mac-desktop screenshot` supplies the native full-frame PNG. The task's
  `render.py` only asserts 2560 × 1440 dimensions and encodes WebP at quality 92,
  method 6. It does not edit interface content. Each subject gets independent
  Ice and Black Ice captures through the app's theme setting.

The task-local pair helper uses the following capture command for each theme:

```sh
"$ADE_CLI_PATH" mac-desktop screenshot --out <raw-png-path> --text
```

Its encoding step is equivalent to:

```python
from PIL import Image

image = Image.open(raw_png_path)
assert image.size == (2560, 1440), image.size
image.save(webp_path, "WEBP", quality=92, method=6)
```

## Image subjects and actual operations

Each prefix below produces `-ice.webp` and `-black-ice.webp` in
`allora-website/assets/`: fourteen subjects and twenty-eight final images.
`ai-chat` appears in both the hero and AI section; `workspace-editor` appears
in the workspace tour and theme gallery. Program's carousel also includes
`workspace-serial`.

| Prefix | Status | Captured state and limits |
| --- | --- | --- |
| `workspace-home` | Captured | Current Home with the unified workspace and design-tool entries. |
| `workspace-editor` | Captured | Async-reset DFF source in the shared Editor, with project explorer and workspace dock. |
| `workspace-testbench` | Captured | Fresh real Icarus Verilog simulation and generated VCD waveforms for the DFF. Earlier log output was cleared before the final capture. |
| `workspace-synthesis` | Captured | Actual Yosys synthesis of the DFF: one synthesized cell and one register. This is the main report, rather than proof of every Synthesis Explorer interaction. |
| `workspace-pins` | Captured | Saved DFF constraints and the board-resource mapping interface. |
| `workspace-bitstream` | Captured | Actual generated DFF BIN artifact, 104,090 bytes, in the consolidated Bitstream workspace. This does not demonstrate physical board behavior. |
| `workspace-program` | Captured | Real programmer check and board detection state: programmer installed, board not detected. No hardware was programmed. |
| `workspace-serial` | Captured | Serial Monitor inside Program, disconnected. No serial traffic or device connection is claimed. |
| `workspace-virtual` | Pending | Fullscreen Virtual FPGA captures and their actual compiled/interactive state remain to be recorded here. |
| `ai-chat` | Captured | Genuine Codex-connected AI Design Studio with an example prompt ready to send. The prompt was not sent; no generated response or completed AI task is shown. |
| `github-workspace` | Captured | Git command mode with an actual `git status --short` result. The development capture is signed out and has no GitHub OAuth client ID configured. No account connection, commit, repository creation, or push was performed. |
| `peripheral-workbench` | Pending | Fullscreen captures and the actual Verilator/device state remain to be recorded here. |
| `memory-asset-studio` | Pending | Fullscreen captures and the actual conversion/generation state remain to be recorded here. |
| `register-builder` | Pending | Fullscreen captures and the actual register generation state remain to be recorded here. |

Captions and alt text should distinguish a feature's supported behavior from
what the image proves. In particular, an unsent AI prompt is not an executed
conversation, a disconnected Serial Monitor is not live hardware, and the
signed-out Git command capture does not establish a GitHub publishing result.

## Completion checklist

- [ ] Capture both `workspace-virtual` themes in native fullscreen; document the
  real compilation and interaction results shown.
- [ ] Capture both `peripheral-workbench` themes in native fullscreen; document
  the real compilation and device state shown.
- [ ] Capture both `memory-asset-studio` themes in native fullscreen; document
  the real imported asset, conversion, and any generation result shown.
- [ ] Capture both `register-builder` themes in native fullscreen; document the
  real register map and any generation result shown.
- [ ] Confirm all twenty-eight final WebP images are 2560 × 1440, replace pending
  table statuses only after observing success, and visually inspect both themes.
- [ ] Verify the website at desktop and mobile widths, all workspace and design
  tabs, the Program/Serial carousel, screenshot enlargement, and theme switching.

The older capture workflow and its window-crop processing remain historical
documentation in [`WEBSITE-CAPTURES-2026-10-07.md`](WEBSITE-CAPTURES-2026-10-07.md)
and [`marketing/README.md`](../README.md). They do not describe this fullscreen
refresh's output processing.
