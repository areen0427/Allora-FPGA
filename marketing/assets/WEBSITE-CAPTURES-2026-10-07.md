# Website captures — 7 October 2026

The new website images are fresh captures of the real Allora Tauri application.
They are not generated UI illustrations or substituted toolchain results.

## Capture and processing

- Task-owned window: 1440 × 960 logical pixels on the isolated marketing origin
  `http://127.0.0.1:5178`.
- macOS ScreenCaptureKit captured only that exact window, at 2880 × 1920 pixels.
  The desktop, other windows, notifications, cursor and audio were excluded.
- ADE's private-display window claim was blocked by missing Accessibility
  permission. No global input or other app window was used; the development
  marketing bridge called normal named UI controls and project loaders.
- Website assets remove only the 32 logical-pixel native titlebar, then resize
  uniformly to 1800 × 1160 pixels (aspect ratio 45:29). There is no rotation,
  perspective transform, UI repainting or content crop.
- WebP exports use quality 92. Raw PNGs remain locally in
  `marketing/.cache/site-shots/`; working project copies remain locally in
  `marketing/.cache/site-projects/`. These cache directories are ignored.
- Temporary capture source additions were removed after the capture; no app
  production code changes are required by these website images.

## Image subjects and actual operations

Each subject has `-ice.webp` and `-black-ice.webp` variants in
`allora-website/assets/`.

| Prefix | Captured state |
| --- | --- |
| `home-trace` | Home with Trace selected in Appearance settings. |
| `home-molecules` | Home with Molecules selected in Appearance settings. |
| `home-ultramatte` | Home with **Refraction** selected; `ultramatte` is the app's internal asset key. |
| `peripheral-workbench` | A copy of `examples/peripheral-workbench` compiled through the real Verilator flow. The UART received `Allora Link ready` sent through the UI, with zero queued bytes and zero framing errors. The RTL-driven LED and seven-segment state is visible; the simulation is paused. |
| `memory-asset-studio` | A 128-sample unsigned sine lookup table was imported as CSV through the Studio file input. Values are `round(32767 × (1 + sin(2πn / 128)))`. The 16-bit preview, zero-error address inspection and conversion settings are visible. Generate files produced the actual memory HEX file and Verilog ROM wrapper (two project files). |
| `register-builder` | A copy of `examples/register-builder` with CONTROL (RW), STATUS (RO), COMMAND (WO) and FLAGS (W1C). Generate files ran through the UI and reported generated files current. CONTROL's ENABLE field is selected. |
| `ai-chat` | The genuine Codex-connected workspace with the register project selected, model/reasoning controls, and an illustrative **unsent** prompt. No AI response was inserted, no request was sent, and no account details are shown. |

After register generation, the saved `register_demo_tb` testbench ran in the app
through local Icarus Verilog and vvp. It printed `REGISTER_PROJECT_PASS` and
produced a real VCD waveform with 32 signals and 63 capture. The example project
copies keep all generated files outside the tracked example directories.

The app screenshots were visually inspected in both themes. Older existing
editor/simulator screenshots remain unchanged for the original website tours.
