# Allora Product Ideas

Living note for product directions worth exploring. These are concepts, not committed roadmap items; details and feasibility still need validation.

## 2026-09-29 — Ideas the user wants to keep

### Allora Link: live display changes

Let users change what a running FPGA displays from Allora, without rebuilding the bitstream for every change. The initial use case is live display updates; the transport, supported display types, and required HDL interface are still open questions. Explore a path that can be developed and demonstrated in simulation before requiring physical hardware.

### Cross-platform project handoff

Package an Allora project so another user can easily open it on a different operating system. The package should include the project files and the metadata needed to reopen the work, while identifying OS-specific tool requirements or unsupported content. Decide later whether delivery is an archive the sender shares, a hosted link, or both. This idea is about reliable portability and opening in Allora; conversion to other FPGA tools such as Vivado is a related but separate scope.
