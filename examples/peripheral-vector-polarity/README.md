# Vector polarity and initial states

Open this folder in Allora and select **Peripheral Workbench**. Compile & Start initializes input bit 63 from an initially-on switch and bit 62 from an inactive active-low momentary button. The RTL inverts the 64-bit input vector. Active-low LEDs observe output bits 63 and 62.

No clock is required: inputs immediately evaluate the combinational RTL, while Step advances one configured time quantum. Run advances simulated time without introducing a clock signal. The board selection remains iCEBreaker; nothing is synthesized or programmed by this workspace.
