# Allora FPGA V0.2 Test Scenarios

These scenarios cover the user-visible V0.2 experiment without changing Git branches or commits.

## 1. Create a simulation-only guided counter

1. Open **Simulate** from Home.
2. Choose **New simulation project**.
3. Keep **SystemVerilog** and **Guided LED counter** selected.
4. Choose a project location and select **Create & start**.

Expected:

- The project is created without selecting a physical board.
- The workspace opens directly on Virtual FPGA.
- `clk`, `rst_n`, `enable`, and `leds[3:0]` are discovered.
- Clock, reset, SW0, and LED0–LED3 are already mapped.
- Build is unavailable and explains that a physical board is needed.

Observed: Passed in the native macOS bundle.

## 2. Compile into the Ready state in Black Ice

1. From the guided counter workspace, choose **Compile & Start**.
2. Wait for the status to become **Ready**.

Expected:

- Run, Pause, Step, Reset, and Stop remain readable in Black Ice.
- Run is the primary action; the other actions use dark neutral controls.
- Top-module and mapping inputs become locked while the native model is active.
- The guide marks Source, Ports mapped, and Model compiled complete.

Observed: Passed after correcting the Black Ice neutral and disabled button treatments.

## 3. Run with the counter disabled

1. Leave SW0 off.
2. Choose **Run** and wait for several refresh intervals.

Expected:

- Simulation time and snapshot count advance.
- `enable` remains low.
- `leds[3:0]` remains zero.
- The waveform-captured guide step completes.

Observed: Passed.

## 4. Drive a virtual input and inspect RTL output

1. While running, turn SW0 on.
2. Observe the LED bank, live waveform, and signal inspector.

Expected:

- `enable` changes high in the waveform and inspector.
- `leds[3:0]` changes as the RTL counter advances.
- Virtual LEDs reflect the Verilator model output.

Observed: Passed; the captured run showed `enable = 1` and changing four-bit LED output.

## 5. Pause, step, reset, and stop

1. Pause the running simulation.
2. Use Step and confirm simulated time advances.
3. Use Reset and confirm the counter output returns to zero.
4. Use Stop and confirm configuration controls unlock.

Expected:

- Each action produces the corresponding lifecycle state.
- The waveform history resets when Reset starts a new trace.
- All controls remain legible in Ice and Black Ice.

Observed: Passed. Pause held simulated time, Step advanced the RTL counter, Reset returned time and outputs to zero and began a fresh trace, and Stop unlocked configuration controls.

## 6. Resume the last execution target

1. Return Home from a simulation workspace.
2. Inspect the Continue Project card.
3. Select **Resume Simulation**.

Expected:

- Continue Project offers one target-aware Resume action.
- Resume returns directly to Virtual FPGA rather than asking the user to choose Simulate or Build again.

Observed: Passed.

## 7. Existing hardware project regression

1. Open an existing physical-board project in Simulate.
2. Compile and run it.
3. Return to Build and visit Editor, Board, Synthesis, Pins, Health, Bitstream, Program, and Serial.

Expected:

- The existing project remains associated with its physical board.
- Simulation does not modify physical constraints.
- Existing build navigation remains available.

Observed: Existing ButterStick project compiled and produced live waveform data. Full physical hardware programming remains a manual release test.

## 8. Shared Testbench waveform and VCD propagation

1. Open the ButterStick project in **Simulate → Testbench**.
2. Run `pwmcontroller_tb.v`.
3. Toggle the signal chips above the waveform.
4. Inspect the generated VCD and board playback.

Expected:

- The Testbench view uses the same waveform treatment as Virtual FPGA.
- Signal chips add/remove traces without hiding the last selected trace.
- Multi-bit signals show their current value and the capture shows its end time.
- UART input values propagate into channel targets, PWM activity, and the error indicator.

Observed: The generated 4.102455 ms VCD showed channel 2 receiving `0x96`, nonzero `pwm_out`, and `error_led` asserting and later clearing. The existing testbench separately reports UART response-byte expectation failures; those do not originate in the waveform renderer.
