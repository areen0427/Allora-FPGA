# Peripheral Workbench: direct I/O and UART

Open this folder as an Allora project, choose **Peripheral Workbench**, then **Compile & Start** and **Run**. No physical board is needed. The project retains its iCEBreaker board selection.

The saved workspace maps a momentary button and toggle to `controls[0:1]`, two LEDs to `leds`, a direct seven-segment display to `segments[7:0]` (a–g, DP), and the UART terminal to `tx`/`rx`.

- Hold the button to display 8 plus the decimal point; release it to display 0.
- The first LED shows button XOR switch. The second shows the inverted switch.
- Send text or hex in the UART terminal. RTL receives and echoes each byte. Use the saved **1,843,200 Hz / 115200 baud / 8N1** settings (16 cycles per bit).
- Paused sends queue until you Run or Step. Reset clears terminal history/queues and recreates the RTL model; Stop ends it.

The direct display has no multiplexing. The example UART is a small instructional single-byte echo implementation, without flow control or buffering for arbitrary transmit bursts. The integration test verifies consecutive bytes at the configured rate.

`../peripheral-vector-polarity` demonstrates clockless logic, active-low devices, initial switch states, and bit 63 without JavaScript numeric rounding. `../virtual-led-counter` demonstrates migration from the original Virtual FPGA mappings.
