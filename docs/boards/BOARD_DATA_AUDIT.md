# Board metadata audit

Checked 2026-10-16 against the supplied **Allora FPGA Board Support Workplan** (23 September, 41 iCE40/ECP5 variants), the owner's LiteX folder, live upstream platform declarations, manufacturer constraints/schematics, and silicon data sheets. This updates published metadata and its presentation. It does not establish that every assembly, peripheral, build or programmer has been tested on hardware.

The current app catalog has **255 physical variants**, including **55 enabled build targets**. Those counts and capability boundaries are unchanged. The workplan's 41 entries are cross-referenced in [BOARD_COVERAGE.md](BOARD_COVERAGE.md); its hardware/programming release tasks remain separate. The catalog's 4,449 old pin aliases became 42,227 source-backed resource/connector aliases. These are alternate signal mappings, not 42,227 independent physical pins. RGB packages contribute three independently driven LED channels.

## Evidence and precedence

1. Maker schematics and revision-specific constraint files settle conflicts in platform declarations. See the [handwritten-board audit](HANDWRITTEN_BOARD_AUDIT.md) for the 39 directly maintained variants, including AC701 voltage/direction corrections, ECPIX RGB polarity/count, iCESugar Pro polarity, and TrellisBoard/NetV2 clocks.
2. [LiteX-Boards at `27cc6fd9`](https://github.com/litex-hub/litex-boards/tree/27cc6fd9b6b2d7a4ddaeb83777eaa1be32d91b65/litex_boards/platforms) provides declared pads, IO standards, oscillator timing, resource names, and connector aliases. The supplied folder was compared read-only with that checkout. Every generated platform has a source SHA-256 digest, selected declaration, URL and revision in [platform-audit.json](platform-audit.json).
3. [hdl/constraints at `cd6ebf23`](https://github.com/hdl/constraints/tree/cd6ebf23edb1209c98b7d88b7167a4707e5372ef/board) provides a cross-check and links to manufacturer sources. It is not assumed correct when a maker schematic disagrees: its AC701 UART direction/voltage wording is a documented example.
4. Manufacturer device tables supply silicon capacities independently of the board pinout. The [device resource audit](DEVICE_RESOURCE_AUDIT.md) and [machine-readable coverage](device-resource-audit.json) document the 101 profiles covering 225 entries, including every enabled build target. Thirty entries retain unresolved identities or revision-specific gaps. Missing fields are unknown, never zero or inferred family maxima.

The [identity audit](CATALOG_IDENTITY_AUDIT.md) documents 38 numeric speed grades that were incorrectly shown as packages. Exact AMD ordering codes now separate silicon, package and speed without changing build IDs or toolchain capabilities.

## Data pipeline

- `src/data/boards/verifiedPlatformData.ts` stores compact reviewed resource declarations. `litexCatalog.ts` retains board/variant/toolchain identity and takes its complete static pin set and source clock from that snapshot. The former hand-truncated pin lists are removed.
- `handwrittenResources.ts` merges reviewed declarations into existing board definitions while retaining meaningful saved-project aliases and explicit maker overrides. LED/button aliases are deduplicated by physical pad; GPIO alternate functions remain visible. `BoardDefinition.sources` shares provenance rather than repeating long URLs on every pin, keeping native MCP's serialized catalog below its 8 MiB limit.
- `BoardPin.sourceUrl`, `BoardClock.sourceUrl`, `differentialPin`, `role` and board `verificationNotes` represent source exceptions and dedicated clocks. An `_n` suffix never establishes polarity: it may mean north or a differential negative leg. Unspecified polarity remains unknown in the frontend and native tool descriptions.
- Default clock name, frequency and pad come from the same declaration; the default period is never copied onto the first unrelated clock pad. Additional frequencies require explicit source timing. Integer 83 ns timing constraints are not accurate oscillator measurements: CR00010's source comment and the [manufacturer SMF2000 catalog](https://www.trenz-electronic.de/trenzdownloads/Trenz_Electronic/-corporate/Trenz-Katalog-2026_web.pdf) establish nominal 12 MHz; TEM0006's physical nominal remains unverified.
- The restricted AST reader never imports or executes upstream code. It ignores integer `Pins(width)` declarations for internal hard-block ports, skips unresolved dynamic extensions with notes, and selects a documented revision rather than merging incompatible revision maps. Connector selection is recorded separately, including common-plus-revision headers.
- Unknown IO standards no longer become an assumed LVCMOS33. Pin-map saving/build preflight exposes incomplete electrical data; native LPF generation rejects it. Flash pads and dedicated-reference clock pairs remain unavailable through alternate aliases of the same physical pad.

## Presentation

`BoardResourceSummary` and shared resource grouping feed project setup, the workspace and the read-only pin catalog. They show precise clock frequencies/pads, architecture-specific capacities, LED channel/button/interface counts and source notes. Physical-board diagrams use one data-driven resource layout, with all controls and peripheral groups represented; large setup thumbnails compress contacts while full diagrams keep selectable resource contacts. They are schematic resource overviews, not mechanically accurate PCB drawings. The Virtual FPGA simulator layout and behavior are preserved.

Pin-mapping-only boards receive metadata and diagram updates, not project/build/programming runners. Package-label normalization does not enable a new toolchain. Source-backed nominal capacity is kept separate from tool-reported utilization: ECP5 slices are not relabeled as LUTs, and SPRAM/LRAM/UltraRAM are not combined into BRAM.

## Reproducing the audit

Use a checkout of the pinned upstream revision and the supplied historical snapshot:

```sh
python3 allora-fpga/scripts/generate-verified-board-data.py \
  --upstream /path/to/pinned/litex-boards \
  --supplied /path/to/supplied/litex-boards-master
node allora-fpga/scripts/audit-device-resources.mjs --write
node allora-fpga/scripts/audit-board-catalog.mjs --write
```

A source revision change requires reviewing the resulting pin/clock/identity differences and maker overrides. The generated file is intentionally compact; the audit JSON provides readable per-platform source metadata. Upstream attribution is in [LITEX_SOURCE_NOTICE.md](LITEX_SOURCE_NOTICE.md).

## Explicit remaining gaps

- Thirty boards lack a sufficiently identified silicon profile; exact IDs/reasons are in `device-resource-audit.json`. The Arctic Tern UM/UM5G conflict remains blocked. An Alveo ES1 assembly is not given production-device capacities, and Catapult's engineering part is not guessed from its apparent numeric density.
- Enclustra ST1 and the two QMTech daughterboard-only platforms have no resolved standalone base IO declaration in this importer. Dynamically supplied extension interfaces are not silently invented. The audit records partial extraction notes.
- Unverified/defaultless source clocks remain visible as unverified for Trenz MF variants/TEM0006, PlutoSDR, Enclustra ST1, Snickerdoodle, CW305, the QMTech daughterboards, QuickFeather, and SLogic16U3. Some require processor-generated, internal or externally configured clocks rather than a fixed package oscillator. None of these is an enabled local iCE40/ECP5 build target.
- Frequency, polarity, voltage, stuffing options and resource availability can vary by revision. Source-declared mappings do not prove every peripheral is populated, attached or electrically interchangeable. Connector aliases may overlap memory, flash or other interfaces.
- The workplan's programmer profiles, runtime USB/adapter identification, boot sequences, SRAM/flash commands, board timing and observed physical behavior still require their own implementation and connected-board evidence. This update does not claim those tasks are complete.
