# First teaser QA — 2026-09-24

Delivered: `output/allora-overview-12s.mp4`. The documented `npm run teaser -- main-overview` command ran end to end: native launch, command bridge, compilation, capture, rendering and inspection-frame extraction. The subsequent framing edit reused that native capture.

## Observed application behavior

- All three scenarios (`main-overview`, `simulate-overview`, `build-overview`) launched the actual Tauri app and produced native ScreenCaptureKit MP4s.
- The counter was compiled by Verilator. Both simulation scenarios asserted the actual UI values: enable on + eight steps → LEDs `0x8`; enable off + three button-driven steps → LEDs `0xB`.
- Live waveforms contain returned clock edges and input changes. No waveform or LED state was manufactured for the video.
- Build's source and pin views were inspected. The example's constraints are intentionally empty. Yosys synthesis produced a real report with 3 logic elements, 1 register, 2 combinational elements and 10 connections. No full bitstream or hardware-programming success is claimed.
- macOS Screen Recording permission was already granted. No Accessibility permission was needed. Initial recorder AppKit initialization was fixed before successful captures.

## Edit iterations and visual review

The first render exposed a simulator crop through a heading and a report selection running into the home transition. After feedback, the edit reduced the intro/outro to 1.1/1.15 seconds, replaced the repeated welcome outro with active virtual-board footage, and switched to heavy system-font titles. A second review found that the portrait crop cut off much of the board, waveform, and synthesis report. The final edit zooms out and repositions those subjects so their complete meaningful content is visible, filling the unused picture area with blurred, dimmed footage from the same recording. The 160px dark title bands are 16.7% of frame height in total. The waveform is held without zoom to preserve its edge labels.

Reviewed raw contact sheets for all workflows and final frames at 0.15, 1.8, 2.1, 4.35, 4.6, 6.35, 6.6, 7.4, 8.2, 10.4, 10.6 and 11.8 seconds. Full-resolution opening, active-board, waveform, report and ending frames were inspected separately. The delivered contact sheet is `frames/allora-overview-12s/contact-sheet.jpg`.

No desktop, Terminal, cursor, notifications, error dialogs or unintended navigation appear in the selected footage. Framing preserves aspect ratio; titles do not cover app controls. The report remains on screen through the end of the Build segment. The fitted crops include the full board and report rather than slicing off their right sides. Fine secondary IDE text is naturally small on a phone; the welcome labels, board controls, wave shapes and synthesis metrics carry the teaser. The deliberate dark title bands and blurred live-footage margins are part of the composition, not accidental black letterboxing.

## Mechanical validation

- FFprobe: H.264, yuv420p, 1080 × 1920, 60/1 fps, 720 frames, stream and container duration both 12.000000 seconds.
- FFmpeg decoded the complete final video with no errors.
- Final version is silent; optional audio and fade controls are implemented but were not used in this deliverable.
- Frontend `npm run build` and `npm run lint` passed. Existing large-bundle warning remains.
- A production build with `VITE_ALLORA_DEMO_TOKEN=release-exclusion-sentinel` contained neither that token nor the bridge endpoint/implementation markers.
- Transport test passed: unauthenticated calls rejected, overlapping commands rejected, one queued delivery, and matching completion acknowledgement.
- `git diff --check` passed.

## Boundaries

macOS 15+ is required for SCRecordingOutput. This machine captured at Retina resolution; source sampling is variable during static frames and the export normalizes it to 60 fps. Capture and render jobs must run one at a time. New UI layouts or scenarios need a fresh visual review and crop adjustment. Hardware programming, full place-and-route, other themes and optional audio were not validated by this teaser.
