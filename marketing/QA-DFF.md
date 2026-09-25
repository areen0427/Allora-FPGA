# iCEBreaker async-reset DFF clip QA — 2026-09-24

The 15-second build-flow video is `output/allora-icebreaker-dff-build-15s.mp4`. Its source is the real Allora Tauri window capture `raw/build-dff-icebreaker.mp4`, with semantic command results and capture-relative shot markers in `raw/build-dff-icebreaker.json`.

The HDL implements one D flip-flop with active-low asynchronous reset. Yosys reported one ADFF cell, one register, three inputs, and one output. In the app's pin mapper, `clk → 35`, `rst_n → 10`, `d → 18`, and `q → 25` were saved to a real PCF. The app then produced a 104,090-byte `Async_Reset_DFF.bin` using Yosys, nextpnr-ice40, and icepack.

iceprog was installed and detected, but the app reported `iCEBreaker` connection `Not detected`. The clip therefore ends on the programming screen with the bitstream selected and a footer asking to connect the board. It does not show a programming success or claim hardware was flashed.

The portrait edit fits each full subject in the frame without cutting off the source code, synthesis metrics, mapped-pin rows, generated bitstream, or programming status. Empty picture space is filled with a tinted blur of the same live footage. Review the contact sheet and full-resolution representative frames in `frames/allora-icebreaker-dff-build-15s/`.

The final MP4 was visually inspected at full resolution and decoded without errors. FFprobe confirmed H.264/yuv420p, 1080 × 1920, 60 fps, 900 frames, and exactly 15.000 seconds. Frontend build, lint, the developer transport test, script syntax checks, and `git diff --check` passed.
