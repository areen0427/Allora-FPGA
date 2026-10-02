# Board support research supplement

Reviewed 30 September 2026 against the 23 September board support workplan and Allora commit `04e0af93344354e20fa5a3d440d281cd0b3ebada`.

The workplan omits **15 existing catalog entries that LiteX identifies as ECP5 boards**, because Allora labels them generic FPGA/Vivado targets. The intended iCE40/ECP5 scope therefore includes at least **56 current catalog entries**, before splitting additional revisions and densities. Published sources also resolve three missing package fields and four missing external clock pads within the original 41. They identify incorrect metadata, omitted user resources, programmer configurations, and electrical requirements. These findings reduce owner research; they do not establish successful programming or physical support.

This supplement covers all 41 workplan variants (16 iCE40 and 25 ECP5) plus those 15 omitted entries. “Open source” here means the workplan's iCE40/ECP5 toolchain scope; it does not mean every board is open hardware or that every board in LiteX uses an open source place-and-route flow. The original DOCX is unchanged. The research findings below describe the baseline; the implementation follow-up is recorded at the end.

## Evidence and reproducibility

- LiteX-Boards snapshot: `c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a`.
- openFPGALoader snapshot: `676e53ec73d2261c974d610b7cf0693117c8d2ef`.
- TinyFPGA B-Series maker snapshot: `e8f915033f7a941647ca5f884e80086a8e68282d`.
- Workplan reviewed: `Allora_FPGA_Board_Support_Workplan.docx`, found at the Downloads location recorded in `CONTINUATION.md`. Its paragraphs, tables, and source hyperlinks were inspected.
- Allora's actual `REAL_BOARDS` definitions were evaluated, including generated variants. The selected catalog IDs total 41, matching the workplan.

Source links below point to the inspected snapshots when available. A platform definition establishes published design intent for its stated revision. A programmer class or board database entry establishes an available software path. Neither establishes the identity of an attached board, its installed bootloader, or a working write. Shared USB identifiers select an interface, not a unique board.

## Fields that can be completed now

| Board | Missing field | Source-supported value | Qualification |
| --- | --- | --- | --- |
| FPGAwars Alhambra II | Clock package pad | `clk12`, pad `49`, 12 MHz | LiteX also confirms `ice40-hx8k-tq144:4k`; preserve the package mode suffix. [Platform][alhambra] |
| Kosagi Fomu EVT | Clock package pad | `clk48`, pad `44`, 48 MHz | SG48 EVT pinout. Do not use the PVT clock pad F4. [Platform][fomu-evt] |
| Kosagi Fomu Hacker | Package and clock pad | `UWG30`; `clk48`, pad `F5`, 48 MHz | Hacker pinout. Do not use PVT pad F4. [Platform][fomu-hacker] |
| BeagleWire | Package and clock pad | `TQ144:4K`; `clk100`, pad `61`, 100 MHz | LiteX build identity is HX8K in 4K package mode. Maker documentation calls the FPGA HX4K; keep the source distinction and confirm the assembly before final support claims. [Platform][beaglewire], [maker hardware][beagle-hardware] |
| Signaloid C0 microSD | Package | `UWG30`, UP5K | Clock requires the special treatment below. [Platform][signaloid] |

Fomu EVT, Fomu Hacker, BeagleWire, and Signaloid currently have the family label `iCE40 LP` in `litexCatalog.ts`. The Fomu and Signaloid parts are UP5K UltraPlus; BeagleWire is HX. Their device identifiers contain the relevant class, but the visible family metadata should be corrected.

## Catalog boards omitted from the workplan

For every catalog spec with a LiteX `source`, the corresponding platform was checked for direct inheritance from `LatticeiCE40Platform` or `LatticeECP5Platform`. These 15 additional specs inherit the ECP5 platform but currently have `family: "FPGA"`, XDC constraints, a Vivado flow/programmer, unknown packages and unknown clock pads. Thirteen also have empty pin maps; the two ULX4M entries have summarized pins. These defaults conceal open source build candidates.

All rows need ECP5 family metadata, the full FPGA identity, LPF constraints, Yosys/nextpnr-ecp5/ecppack flow, source-qualified pins and an actual programmer profile. The identities below are platform defaults; additional accepted density arguments are not evidence that every physical assembly exists. Every board still needs the connected-hardware acceptance checks.

| Existing catalog entry | Published default identity | Clock | Programming and revision qualification |
| --- | --- | --- | --- |
| Colorlight 5A 75B | U25, CABGA256 for default r7.0 | 25 MHz P6 | r6.1 is CABGA381 and clock P3; r7.0/8.0/8.2 are BG256. Revision-specific LEDs/connectors and external FTDI OpenOCD configuration exist. [Source][extra-75b] |
| Colorlight 5A 75E | U25, CABGA256 for default r7.1 | 25 MHz P6 | r6.0/7.1/8.2 accepted; select revision-specific resources and the source FTDI config. [Source][extra-75e] |
| Logicbone | UM5G45, CABGA381, rev0 | 25 MHz M19, **LVCMOS18** | DFU `1d50:6130`; alternate not specified by its factory. Published LEDs D16/C15/C13/B13. [Source][extra-logicbone] |
| Machdyne Konfekt | U12, CABGA256, v0 | 48 MHz A7 | Caller-selected openFPGALoader cable. LEDs G1/E1/C1; connectors and flash map published. [Source][extra-konfekt] |
| Machdyne Kopflos | U12, CABGA256, v0 | 48 MHz A7 | Caller-selected cable. LEDs C1/E1/G1 and connector map published. [Source][extra-kopflos] |
| Machdyne Lakritz | U25, CABGA256, v0 | 48 MHz A7 | Caller-selected cable; LED A2. [Source][extra-lakritz] |
| Machdyne Minze | U12, CABGA256, default v0 | 48 MHz A7 | v0/v1 resource selection; caller-selected cable, LED A2. [Source][extra-minze] |
| Machdyne Mozart ML1 | U45, CABGA256, default v2 | 48 MHz A7; also declares 50 MHz C7 | v0/v1/v2; preserve both clocks and select the appropriate design input. Caller-selected cable. [Source][extra-mozart1] |
| Machdyne Mozart ML2 | U45, CABGA256, v0 | 48 MHz C7 | Caller-selected cable; UART and connector/peripheral resources published. [Source][extra-mozart2] |
| Machdyne Noir | U45, CABGA256, v0 | 48 MHz A7 | Caller-selected cable; LEDs C1/E1/G1. [Source][extra-noir] |
| Machdyne Schoko | U45, CABGA256, default v1 | 48 MHz A7 | v1/v2; caller-selected cable. LEDs B1/C1/D1. Do not apply loader profile `LD-SCHOKO` without checking the assembly. [Source][extra-schoko] |
| Machdyne Vanille | U12, **TG144** package, v0 | 48 MHz pad 128 | Caller-selected cable; LED 52. Validate nextpnr's package database and Allora's normalization rather than treating this as CABGA256. [Source][extra-vanille] |
| Machdyne Vivaldi ML1 | U45, CABGA256, default v2 | 48 MHz A7; also declares 50 MHz C7 | v0/v1/v2; preserve clock choice and revision. Caller-selected cable. [Source][extra-vivaldi] |
| Radiona ULX4M LD V2 | UM5G85, CABGA381, default r0.3 | 25 MHz G2 | r0.1/0.2/0.3; loader `ulx4m_dfu`, DFU `1d50:614b`, alternate 0. [Source][extra-ulx4m-ld], [loader database][loader-boards] |
| Radiona ULX4M LS V2 | U85, CABGA381, r0.1 | 25 MHz G2 | Same published DFU profile; **U**, not LD's UM5G class. [Source][extra-ulx4m-ls] |

This raises the ECP5 count from 25 to 40 existing catalog entries. Additional revision/density profiles will raise the concrete variant count further. Classification must use parsed device/platform evidence rather than the current family labels, or the same omissions will recur.

### Signaloid clock and programming require a different profile

Do **not** simply replace the unknown oscillator pin with B3. Although the LiteX platform declares `clk12` there, B3 is also SD_CLK and serial RX. Its actual [LiteX target][signaloid-target] generates its system clock using `SB_HFOSC`, with selectable 6/12/24/48 MHz rates and a 24 MHz default. The manufacturer's 12 MHz SoC specification does not establish a dedicated external 12 MHz oscillator on B3.

The manufacturer documents flashing custom BIN images through the SD host block device using `C0_microSD_toolkit.py`, followed by operation without the SD host. Custom bitstreams occupy a dedicated flash region. This is a different transport from the catalog's generic `iceprog`; factory/recovery SPI pads are a separate path. Record a clock source such as `internal-hfosc`, the chosen design frequency, the SD transport, bootloader mode, and custom-image region. [Manufacturer custom bitstream guide][signaloid-modes], [electrical and pad reference][signaloid-specs]

## Existing fields needing correction

| Board or implementation | Current problem | Verified correction or engineering consequence |
| --- | --- | --- |
| iCESugar Pro | Shared `makeEcp5Variant` helper makes this `LFE5UM5G-25F`. Workplan repeats that identity. | Both LiteX and the maker specify **LFE5U-25F-6BG256C**, CABGA256, 25 MHz on P6. Correct both `device` and `fpgaId`; select nextpnr's U class. Limit the correction to this board rather than changing the helper's other users. [Platform][icesugar-pro], [maker][icesugar-pro-maker] |
| TrellisBoard | Catalog clock L5, LEDs B22/A21, no buttons; workplan treats these as populated resources. | Upstream default clock is **12 MHz on B3**. LED0/1 are **C26/D26**; there are 12 LEDs and four buttons. Treat the resource map as needing reconciliation. The optional 100 MHz B29 clock has an explicit rev1.0 defect note. [Platform][trellisboard] |
| Lattice ECP5 VIP | Catalog calls its clock `clk100` on C5 but assigns 27 MHz. | Source has **27 MHz on E17** as default, plus a separate **100 MHz LVDS** clock on C5. Represent both with their correct electrical type; do not assign the 27 MHz rate to C5. [Platform][vip] |
| Cam Link 4K | Workplan suggests its sole resource might be a clock; actual catalog resource is LED A9. | Source has two LEDs, **A6 and A9**, and a separate **27 MHz B11** clock. UART TX/RX reuse the LED pads. Mark these aliases as mutually exclusive assignments. Source identifies a separate FX3 exploration/loader project, not a configured openFPGALoader profile. [Platform][camlink], [loader project][camlink-loader] |
| Fomu EVT and Hacker | Several resources omitted by the catalog import. | EVT also has button pad 42, serial, USB, I2C and connectors. Hacker also has touch pad F4 and USB pads A4/A2/D5. Restore resources with revision-specific identity and electrical constraints. [EVT][fomu-evt], [Hacker][fomu-hacker] |
| BeagleWire | Catalog exposes SDRAM samples and one button, but no LEDs. | Source exposes LEDs **28/29/31/32**, SPI flash and four GPIO connector groups plus Grove. Its programmer factory returns TinyProg, while maker software documents BeagleBone SPI/flashrom and kernel workflows. Do not treat either `iceprog` or TinyProg as a verified direct macOS path. [Platform][beaglewire], [maker programming guide][beagle-programming] |
| Signaloid resources | Catalog omits DAT0 and both LEDs. | DAT0 **A1**, green LED **A5**, red LED **B5**. Maker specifies open-drain LED behavior and 1.8 V configuration pads. Preserve those requirements. [Manufacturer][signaloid-specs] |

### Electrical and resource metadata missing from the workplan

The `BoardPin` model has no I/O standard, voltage, differential pair, open-drain requirement, or alias/conflict field. `BoardClock` has no internal/external source field. These are required to preserve information already published by upstream.

`pinMappingUtils.ts` emits `IO_TYPE=LVCMOS33` for all LPF ports; `templates.ts` does the same. The pin inspector also displays LVCMOS33 universally. Source examples that this cannot represent correctly include Cam Link's **LVCMOS25** clock/LEDs, Versa ECP5's **LVDS** clock, TrellisBoard's **SSTL135_I** buttons, Fomu EVT's **LVCMOS18** I2C, and Signaloid's **1.8 V** configuration port. Add the electrical metadata and consume it in constraints and the UI before declaring those paths complete. [Cam Link][camlink], [Versa][versa], [TrellisBoard][trellisboard], [Fomu EVT][fomu-evt], [Signaloid][signaloid-specs]

Also preserve full bus widths, connector position numbering, pull modes and shared-pad ownership. The existing import explicitly summarizes large buses; “verified” currently does not mean complete peripheral coverage. A pad absent from the platform's `Pins()` entries alone is not an error: connector entries can define additional valid pads.

## Programmer fields available from sources

### DFU selectors

| Board | Published VID:PID | Alternate | Evidence and remaining qualification |
| --- | --- | --- | --- |
| Fomu bootloader | `1209:5bf0` | 0 | openFPGALoader `fomu` entry and maker workshop. Check installed Foboot and revision; this does not apply to every physical Fomu's recovery interface. [Board database][loader-boards], [workshop requirements][fomu-workshop] |
| iCE V Wireless | `1d50:6146` | Not specified by its LiteX factory | `DFUProg` explicitly supplies the IDs. Do not infer alternate 0 from Bitsy solely because the IDs match. [Platform][ice-v] |
| iCEBreaker Bitsy V0/V1 | `1d50:6146` | 0 in openFPGALoader | LiteX supports both revisions with the same programmer factory; loader has `icebreaker-bitsy`. Actual installed bootloaders remain to be checked. [Platform][bitsy], [board database][loader-boards] |
| OrangeCrab r0.2 | `1209:5af0` | 0 | Explicit `DFUProg` arguments. [Platform][orangecrab] |
| ButterStick r1.0, 25F/45F/85F | `1209:5af1` | 0 | Explicit DFU branch; all three densities and r1.0 are accepted by the platform. It also supplies a distinct JTAG branch. [Platform][butterstick] |

These identifiers and source branches can be removed from the owner's discovery checklist. Keep a live enumeration check, firmware version, serial selection, boot-entry procedure, image format, target memory and reboot test. A DFU API's `load_bitstream` name does not prove volatile SRAM behavior. openFPGALoader's DFU implementation uses a DFU parser, so raw BIN/BIT acceptance must be checked separately from board profile availability. [DFU implementation][loader-dfu]

### OpenOCD assets already provided by LiteX

The owner does not need to invent interface scripts for these boards. The scripts below are published starting points, not complete Allora invocations or tested flash operations.

| Board | Configuration | Adapter selector | Source qualification |
| --- | --- | --- | --- |
| Lattice ECP5 EVN | `openocd_evn_ecp5.cfg` | FTDI `0403:6010`, channel 0 | Expected ID `0x81113043`. [Config][cfg-evn] |
| Lattice Versa ECP5 | `openocd_versa_ecp5.cfg` | FTDI `0403:6010`, channel 0 | Expected ID `0x81112043`; confirm UM/UM5G assembly. [Config][cfg-versa] |
| TrellisBoard | `openocd_trellisboard.cfg` | FTDI `0403:6010`, channel 0 | Expected ID `0x81113043`, adapter rate 5000 kHz. [Config][cfg-trellis] |
| ButterStick | `openocd_butterstick.cfg` | FTDI `0403:6014`, channel 0 | Script hardcodes 85F ID `0x81113043`; do not apply it unchanged to 25F/45F. [Config][cfg-butterstick] |
| FPC III | `openocd_fpc_iii.cfg` | FTDI `1209:fc30` or `0403:6010`, channel 0 | Expected ID `0x41113043`. [Config][cfg-fpc] |
| Colorlight i5A 907 | `openocd_colorlight_5a_75b.cfg` | FTDI `0403:6014`, channel 0 | Its platform reuses this external adapter config; selector is not evidence of an onboard FTDI bridge. [Platform][i5a], [config][cfg-colorlight] |
| Lattice ECP5 VIP | `openocd_evn_ecp5.cfg` referenced by factory | FTDI `0403:6010`, channel 0 | Reuse is upstream intent; validate actual target/chain. [Platform][vip] |
| LimeSDR Mini V2 | `openocd_limesdr_mini_v2.cfg` | FTDI `0403:6010`, channel 0 | Expected ID `0x41112043`; does not establish that its ordinary USB interface reaches JTAG without an external probe. [Config][cfg-lime] |
| LiteX Acorn Baseboard | `openocd_litex_acorn_baseboard.cfg` | FTDI `0403:6010`, channel 0 | Includes Xilinx 7-series and ECP5 target scripts; account for the multi-device chain. [Config][cfg-acorn] |

Package scripts with their license, resolve their dependent target files, generate the configuration-loading commands, select the correct TAP, and distinguish SRAM loading from flash programming. A filename appended to `openocd` is still insufficient. Arctic Tern's platform references the EVN script, but that does not settle its UM/UM5G assembly conflict or external-probe wiring.

### Named openFPGALoader profiles and candidate operations

| Board | Verified software profile | Cable / selector |
| --- | --- | --- |
| Lattice ECP5 EVN | `ecp5_evn` | `ft2232` |
| ECPIX 5 r02, 45F/85F | `ecpix5` | `ecpix5-debug`, FTDI `0403:6010` |
| ECPIX 5 r03, 45F/85F | `ecpix5_r03` | `ft4232`, FTDI `0403:6011` |
| iCEPi Zero, 25F/45F | `icepi-zero` | `ft231X`, FTDI `0403:6015`, JTAG bitbang |
| Colorlight i5 | `colorlight-i5` | `cmsisdap`; default cable selector `0d28:0204` is probe metadata, not a universal board ID |
| ULX3S, 12F/25F/45F/85F | `ulx3s` | `ft231X`, FTDI `0403:6015` |

Sources: [board database][loader-boards], [cable database][loader-cables], [ECPIX revision selection][ecpix5], [iCEPi platform][icepi]. ECPIX's exact identifier is **`ecpix5_r03`**, with an underscore, not `ecpix5-r03`.

The loader's documented JTAG templates are `openFPGALoader -b <profile> design.bit` for SRAM and `openFPGALoader -b <profile> -f design.bit` for flash. They are candidate commands for connected-board validation. Do not extend this SRAM/flash distinction automatically to DFU or SPI-only paths. [Official usage][loader-usage]

LiteX Acorn Baseboard uses `ecpix5` with a cable override derived from FTDI discovery (`digilent_hs2` for FT232, otherwise `ft2232`/`ft4232`). This is a concrete source path, but upstream depends on `lsusb` and generic device-description matching. Implement explicit adapter selection for macOS rather than copying that discovery logic. Its `default_clk_period = 1e9/506` also conflicts with its 50 MHz finalization constraint; retain 50 MHz pending maker confirmation. [Platform][acorn]

## Coverage of all 41 workplan variants

Every row retains connected-hardware validation: actual revision and FPGA marking, software build, selected adapter/bootloader, intended programming operation, reset/recovery, power cycle and observed I/O. The last column adds board-specific unresolved work. An unchanged row is not a claim that every pin or peripheral was revalidated against a schematic.

| Variant | Research result | Additional work remaining |
| --- | --- | --- |
| Fomu PVT | UP5K UWG30, 48 MHz F4 agrees with LiteX; source DFU selector above. [Source][fomu-pvt] | Match Foboot, suffix/artifact rules and operation; validate touch inputs. |
| iCEBreaker | UP5K SG48, 12 MHz 35; IceStorm factory. [Source][icebreaker] | Reconcile Allora's custom SPI/I2C/RGB resource names with maker connectors; not every app label denotes an onboard peripheral. |
| iCE V Wireless | DFU VID/PID now known; platform distinguishes v0/v1. [Source][ice-v] | Select intended revision; identify actual alternate, boot sequence and image format. |
| Lattice iCE40UP5K EVN | Source exposes external programming header and multiplexed connectors. [Source][ice40-evn] | Identify external programmer; preserve J7/PMOD multiplexing rules. |
| iCESugar Pro | Correct FPGA class to U25; maker describes iCELink, JTAG1 selection and flash alternatives. [Source][icesugar-pro-maker] | Validate `ecpdap` subcommands or maker tool; preserve selected native JTAG path. |
| iCESugar v1.5 | UP5K SG48; maker documents BIN drag-and-drop, 12 MHz bridge clock, `icesprog`. [Source][icesugar-maker] | Match bridge firmware and test write/reset/readback. |
| Lattice ECP5 EVN | Named loader profile plus complete interface config available. [Source][ecp5-evn] | Select backend and validate flash procedure. |
| Lattice Versa ECP5 | Published FTDI config; 100 MHz clock is LVDS. [Source][versa] | Preserve differential clock requirements and confirm UM/UM5G part. |
| OrangeCrab r0.2 25F | Source supplies DFU IDs/alternate; r0.1/r0.2 have separate resource sets. [Source][orangecrab] | Check GPIO aliases and installed bootloader; target optionally implements one-second DFU reset behavior. |
| TrellisBoard | Clock/LED map needs correction; config published. [Source][trellisboard] | Import correct buttons/LEDs/electrical types; avoid defective rev1.0 100 MHz input. |
| ButterStick 25F | r1.0 supported source branch; separate JTAG/DFU options. [Source][butterstick] | Fix composite executable; select 25F ID rather than script's 85F ID. |
| ButterStick 45F | Same r1.0 platform and DFU selector. [Source][butterstick] | Select 45F target ID and validate its artifact. |
| ButterStick 85F | Same platform; published JTAG script has 85F ID. [Source][butterstick] | Match bridge firmware and selected operation. |
| Colorlight i5 | Source supports i5 revision 7.0; loader CMSIS-DAP profile. The separate i9 branch is revision 7.2. [Source][i5] | Match revision and external probe; no universal CMSIS-DAP USB ID. |
| Colorlight i5A 907 | Source revision 7.0, U25 BG256; external FTDI config published. [Source][i5a] | Confirm physical adapter/wiring; do not substitute i5 CMSIS-DAP profile blindly. |
| ECPIX 5 45F | r02/r03 loader profile spelling and cables resolved. [Source][ecpix5] | Confirm physical revision and matching cable. |
| ECPIX 5 85F | Same revision selection; UM5G85 BG554. [Source][ecpix5] | Confirm revision and density-specific build. |
| iCEBreaker Bitsy V0 | Shared source DFU factory and loader alternate 0. [Source][bitsy] | V0 resource map and actual bootloader behavior. |
| iCEBreaker Bitsy V1 | Same DFU path, separate source resource map. [Source][bitsy] | V1 resource map and actual bootloader behavior. |
| iCEPi Zero 25F | Named FT231X bitbang profile resolved. [Source][icepi] | Check target detection and flash behavior. |
| iCEPi Zero 45F | Same source constructor supports density argument. [Source][icepi] | Verify 45F assembly and matching bitstream. |
| Alchitry Cu V1 | Source confirms CB132, P7 100 MHz, eight LEDs, reset P8; serial and I2C also published. [Source][alchitry] | Import omitted user interfaces if desired; test actual SPI programmer. |
| Cam Link 4K | Missing LED A6 and UART aliases identified; FX3 loader research exists. [Source][camlink] | Working production programming/recovery route remains unestablished; source loader project describes itself as unfinished. |
| FPC III | Source supplies FTDI selectors and OpenOCD config. [Source][fpc] | Integrate correct TAP/flash commands and connector coverage. |
| FPGAwars Alhambra II | Clock pad 49 resolved; source also exposes switches, UART, flash and connectors. [Source][alhambra] | Import omitted resources and validate 4K mode build. |
| Hackaday Hadbadge | Source has U45 BG381 and 8 MHz U18. Its programmer factory raises `NotImplementedError`. [Source][hadbadge] | Research an actual adapter/loader; generic openFPGALoader is not established by LiteX. |
| Kosagi Fomu EVT | Clock pad 44 resolved; omitted user interfaces identified. [Source][fomu-evt] | Distinguish IceStorm recovery/access from installed DFU bootloader. |
| Kosagi Fomu Hacker | UWG30 and clock F5 resolved; touch/USB additions identified. [Source][fomu-hacker] | Same bootloader/recovery distinction; Hacker-specific build. |
| Lattice ECP5 VIP | Default clock corrected to 27 MHz E17; extra 100 MHz LVDS clock identified. [Source][vip] | Match reused config to actual board chain and electrical types. |
| LimeSDR Mini V2 v2.3 | Upstream has U45 MG285 and external FTDI config. [Source][lime] | Keep workplan's v2.3 assembly qualification and external JTAG wiring check. |
| LiteX Acorn Baseboard | FTDI cable override and multi-device-chain config available. [Source][acorn] | Explicit macOS adapter selection, correct chain, clock typo qualification. |
| Machdyne Kröte | LiteX records HX8K BG121, whereas the maker and existing workplan specify HX4K BG121. Clock B6 100 MHz and user pads are available upstream. [LiteX][krote], [maker][krote-maker] | Prefer maker assembly/build evidence over blindly importing the LiteX density; verify external ISP adapter and SRAM/flash results. |
| BeagleWire | TQ144:4K and clock 61 resolved; LEDs/headers omitted; maker host programming path found. [Source][beaglewire] | Reconcile HX4K/HX8K nomenclature; implement BeagleBone-host workflow rather than assume a local USB programmer. |
| RCS Arctic Tern BMC Card | Source explicitly permits both UM and UM5G and references EVN config. [Source][arctic] | Physical assembly still decides the class; source does not resolve schematic discrepancy. |
| Signaloid C0 microSD | UWG30; internal clock target; SD flashing; missing DAT0/LEDs identified. [Source][signaloid-target] | Model clock source and SD transport; preserve protected regions and identify actual host device. |
| ULX3S 12F | Source accepts density; loader profile/cable resolved. [Source][ulx3s] | Keep maker v2/v3 constraint qualification and validate 12F artifact. |
| ULX3S 25F | Same source profile; FT231X selector. [Source][ulx3s] | Revision and 25F hardware test. |
| ULX3S 45F | Same source profile; FT231X selector. [Source][ulx3s] | Revision and 45F hardware test. |
| ULX3S 85F | Same source profile; FT231X selector. [Source][ulx3s] | Revision and 85F hardware test. |
| TinyFPGA B2 | Maker PCF confirms B4 clock and B-series pads; no `tinyfpga_b2.py` in this LiteX snapshot. [Maker constraints][tiny-b-pcf] | Preserve B2/BX distinction; validate legacy `tinyfpgab` and serial device. |
| TinyFPGA BX | LiteX agrees with LP8K CM81, 16 MHz B2 and TinyProg factory. [Source][tiny-bx] | Verify `tinyprog -p`, bootloader version and serial selection. |

## Workplan changes recommended from this pass

1. Add the 15 omitted ECP5 entries to the workplan and replace requests to discover resolved package, clock, USB and profile fields with source references plus physical-revision confirmation.
2. Correct the iCESugar Pro FPGA class, TrellisBoard resource map, VIP clock and Cam Link resource description before relying on the catalog for builds.
3. Add electrical standards, clock source, full connector mapping and resource conflicts to the definition of complete metadata.
4. Add the Signaloid SD-host and BeagleWire BeagleBone-host programming workflows. Keep Cam Link and Hadbadge programming explicitly unresolved.
5. Reuse published OpenOCD assets where appropriate, but check expected IDCODEs by density and chain. Track each operation's artifact format, flash region, and bootloader separately.
6. Retain every connected-hardware acceptance test. Internet research cannot complete readback, reset, power-cycle, recovery or observed-I/O evidence for these assemblies.

The workplan's statement that all 41 are technically supportable should remain a target, conditional on resolving these issues. Availability of open source host tools alone does not establish a usable path for each board.

[acorn]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/litex_acorn_baseboard.py
[alchitry]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/alchitry_cu.py
[alhambra]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/fpgawars_alhambra2.py
[arctic]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/rcs_arctic_tern_bmc_card.py
[beagle-hardware]: https://github.com/mwelling/beagle-wire
[beagle-programming]: https://beaglewire.github.io/Blogs/Getting_BBB_Ready_for_BeagleWire.html
[beaglewire]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/qwertyembedded_beaglewire.py
[bitsy]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/icebreaker_bitsy.py
[butterstick]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/gsd_butterstick.py
[camlink]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/camlink_4k.py
[camlink-loader]: https://github.com/ktemkin/camlink-re
[cfg-acorn]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/prog/openocd_litex_acorn_baseboard.cfg
[cfg-butterstick]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/prog/openocd_butterstick.cfg
[cfg-colorlight]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/prog/openocd_colorlight_5a_75b.cfg
[cfg-evn]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/prog/openocd_evn_ecp5.cfg
[cfg-fpc]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/prog/openocd_fpc_iii.cfg
[cfg-lime]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/prog/openocd_limesdr_mini_v2.cfg
[cfg-trellis]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/prog/openocd_trellisboard.cfg
[cfg-versa]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/prog/openocd_versa_ecp5.cfg
[ecp5-evn]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/lattice_ecp5_evn.py
[ecpix5]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/lambdaconcept_ecpix5.py
[fomu-evt]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/kosagi_fomu_evt.py
[fomu-hacker]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/kosagi_fomu_hacker.py
[fomu-pvt]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/kosagi_fomu_pvt.py
[fomu-workshop]: https://workshop.fomu.im/en/latest/requirements/index.html
[fpc]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/fpc_iii.py
[hadbadge]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/hackaday_hadbadge.py
[i5]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/colorlight_i5.py
[i5a]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/colorlight_i5a_907.py
[ice-v]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/ice_v_wireless.py
[ice40-evn]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/lattice_ice40up5k_evn.py
[icebreaker]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/icebreaker.py
[icepi]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/icepi_zero.py
[icesugar-maker]: https://github.com/wuxx/icesugar
[icesugar-pro]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/muselab_icesugar_pro.py
[icesugar-pro-maker]: https://github.com/wuxx/icesugar-pro
[krote]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_krote.py
[krote-maker]: https://github.com/machdyne/krote
[lime]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/limesdr_mini_v2.py
[loader-boards]: https://github.com/trabucayre/openFPGALoader/blob/676e53ec73d2261c974d610b7cf0693117c8d2ef/src/board.hpp
[loader-cables]: https://github.com/trabucayre/openFPGALoader/blob/676e53ec73d2261c974d610b7cf0693117c8d2ef/src/cable.hpp
[loader-dfu]: https://github.com/trabucayre/openFPGALoader/blob/676e53ec73d2261c974d610b7cf0693117c8d2ef/src/dfu.cpp
[loader-usage]: https://github.com/trabucayre/openFPGALoader/blob/676e53ec73d2261c974d610b7cf0693117c8d2ef/doc/guide/first-steps.rst
[orangecrab]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/gsd_orangecrab.py
[signaloid]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/signaloid_c0_microsd.py
[signaloid-modes]: https://docs.signaloid.io/docs/compute-modules/c0-series/c0-microsd/develop/modes-and-custom-bitstream/
[signaloid-specs]: https://docs.signaloid.io/docs/compute-modules/c0-series/c0-microsd/hardware-reference/specifications/
[signaloid-target]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/targets/signaloid_c0_microsd.py
[tiny-b-pcf]: https://github.com/tinyfpga/TinyFPGA-B-Series/blob/e8f915033f7a941647ca5f884e80086a8e68282d/icestorm_template/pins.pcf
[tiny-bx]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/tinyfpga_bx.py
[trellisboard]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/trellisboard.py
[ulx3s]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/radiona_ulx3s.py
[versa]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/lattice_versa_ecp5.py
[vip]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/lattice_ecp5_vip.py

[extra-75b]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/colorlight_5a_75b.py
[extra-75e]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/colorlight_5a_75e.py
[extra-logicbone]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/logicbone.py
[extra-konfekt]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_konfekt.py
[extra-kopflos]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_kopflos.py
[extra-lakritz]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_lakritz.py
[extra-minze]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_minze.py
[extra-mozart1]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_mozart_ml1.py
[extra-mozart2]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_mozart_ml2.py
[extra-noir]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_noir.py
[extra-schoko]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_schoko.py
[extra-vanille]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_vanille.py
[extra-vivaldi]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/machdyne_vivaldi_ml1.py
[extra-ulx4m-ld]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/radiona_ulx4m_ld_v2.py
[extra-ulx4m-ls]: https://github.com/litex-hub/litex-boards/blob/c0d9cdf11e20c8b774f4ee1154fddac6e1dca03a/litex_boards/platforms/radiona_ulx4m_ls_v2.py

## Build catalog implementation follow-up

The Build page now exposes 43 family/board cards covering all 56 concrete iCE40/ECP5 variants. Its former 27-card count represented 37 variants; four unresolved original variants were hidden and 15 ECP5 entries were mislabeled as Vivado targets. The corrected package and family metadata enables bitstream generation for 55 variants. Arctic Tern remains visible with an unresolved-identity warning and its bitstream build remains blocked. Grouped Mozart MX variants stay outside the open-toolchain Build view.

Search matches board/family names, vendors, FPGA parts, packages and variant identifiers across the entire Build catalog, including cards beyond the initial preview. Source-qualified defaults were imported for the 15 omitted ECP5 profiles; their assembly revisions and hardware programming still need confirmation. Logicbone constraints retain the published 1.8 V clock I/O standard. Signaloid uses an internal SB_HFOSC starter instead of treating SD_CLK as an external oscillator. Mozart ML1 retains both published clocks and the default-v2 UART map.

Validation: production build and lint pass; catalog assertions check 43 cards/56 variants, 55 build-eligible variants, mixed-family filtering, unknown packages, search and electrical/clock metadata. Representative Verilog starters for Machdyne Vanille (TQFP144), Logicbone (UM5G45/CABGA381, LVCMOS18 clock) and Signaloid (UP5K/UWG30, internal oscillator) pass local Yosys synthesis, NextPNR placement/routing and bitstream packing. These software checks do not establish physical programming support.
