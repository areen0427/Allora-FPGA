# Allora video direction

Allora is premium engineering software. Let actual product behavior carry the film. Use the application's existing Ice or Black Ice design, with restrained cyan/electric-blue accents, cool glass, and a quiet Frutiger Aero influence. Do not redesign the product for a recording.

## Composition

- Deliver 1080 × 1920 vertical MP4. The overview is exactly 12 seconds / 720 frames at 60 fps. Preserve native source motion; duplicate static frames rather than synthesize motion.
- For the overview, fit each complete subject inside the 1080 × 1600 picture area, leaving 160px title bands above and below (16.7% of the frame combined). Fill unused picture area with a blurred, dimmed copy of the same live recording. Preserve aspect ratio and select a deliberate region for each shot; never blindly center-crop the app.
- Exclude the native window chrome and recording badge in the edit. Leave room around panel boundaries and complete text lines. The detailed board shot should retain the FPGA, mapped LEDs, switch and button together.
- Inspect at full resolution and phone size. UI text needed for the story must be readable. Do not rely on the viewer reading a whole IDE in a two-second shot.
- Keep heavy system-font titles in the top band and supporting copy in the bottom band, with important UI unobscured. Preserve generous top/bottom social-interface safe zones. Use the actual Allora name/wordmark, system sans-serif typography, and restrained weight.
- Gradient title bands and blurred footage margins are intentional composition space; avoid accidental black bars, stretched footage, desktop content and cropped headings.

## Rhythm and honesty

Use 4–7 meaningful shots. The default overview uses six: welcome (1.1 s), real switch/LED response (3.2 s), waveform (2.2 s), synthesis start (0.75 s), actual synthesis report (3.6 s), and a live virtual-board end frame (1.15 s). Capture extra handles around every selection.

Cut on an action or a meaningful state change. Use gentle 0–2% moves; keep waveform labels stable when a zoom would clip them. Clean cuts are preferred; brief fades are available when motivated. Do not turn an entire workflow into a sped-up recording.

Compile before the simulation shot. Let genuine native tool results settle before marking a report shot. Show input → output causality. Never create fake successful builds, timing, programming, logs, waveforms or LED states. The counter demo establishes Yosys synthesis only; it does not claim bitstream generation or a connected-board programming test.

Avoid glitches, emojis, giant captions, random stock footage, generic technology graphics, excessive transitions, motion blur and repeated punch-ins. Avoid lengthy loading/error states in the final film; fix the cause or choose another truthful shot.

## Audio

The default works muted and contains no music. Only add licensed local audio or original sound design. Never download copyrighted social-platform music. Optional audio is AAC, gently faded, and should not substitute for visible action.

## Required visual QA

1. Inspect raw frames to confirm the intended application/window and real results.
2. Inspect final frames near 0.15, 1.8, 2.1, 4.35, 4.6, 6.35, 6.6, 7.4, 8.2, 10.4, 10.6 and 11.8 seconds. Adjust sample times if the edit changes.
3. Check every crop edge, title, UI panel boundary, aspect ratio, input/output state, and transition. Inspect full-resolution frames as well as the contact sheet.
4. Check that a shot does not contain the next navigation before its cut. Lengthen raw holds and recapture when necessary.
5. Verify H.264, yuv420p, 1080 × 1920, 60 fps, exactly 720 frames and exactly 12 seconds. Decode the final MP4 for errors. A successful FFmpeg command alone is not acceptance.
6. Record findings and revisions in `QA.md` with honest limitations. Preserve raw capture/journal evidence locally.
