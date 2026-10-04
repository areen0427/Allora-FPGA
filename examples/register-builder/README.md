# Register Builder V1 example

Open this folder in Allora, then choose Register Builder. The saved map has CONTROL (RW), STATUS (RO), COMMAND (WO), and FLAGS (W1C). CONTROL.ENABLE drives the handwritten counter's enable input; STATUS.COUNT reads the hardware counter. The generated wrapper shares explicitly selected `clk` and active-high synchronous `rst` with the original design.

Choose Testbench → Run Simulation. Assertions verify that a register write starts the counter, hardware status is readable, WO data is consumed but reads as zero, and writing one clears a sticky flag. Success prints `REGISTER_PROJECT_PASS` and generates waveforms. Use Peripheral Workbench to map wrapper inputs/outputs for interactive Verilator simulation.

Generated outputs and their ownership hashes live in `Register_Map/`. Regenerate in the builder; preserve edited generated files before regeneration. The manifest is restored on project reopening. The physical bus master/protocol adapter and physical pin mapping belong to your surrounding design. This is a simulation project; no board programming was tested.

From this directory, a standalone check is:

```sh
iverilog -g2012 -s register_demo_tb -o /tmp/register-demo.out src/register_demo.sv Register_Map/demo_registers.sv Register_Map/demo_registers_top.sv sim/register_demo_tb.sv
vvp /tmp/register-demo.out
```
