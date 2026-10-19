# FPGA device resource audit

Checked 2026-10-16. The executable database is
[`fpgas.ts`](../../allora-fpga/src/data/fpgas.ts). Its profiles apply across package
and speed-grade aliases only after the board's silicon identity has been established.
They do not grant project, bitstream, or programmer capabilities to catalog-only boards.

Regenerate the per-board coverage and explicit gap inventory from the repository root:

```sh
cd allora-fpga
node scripts/audit-device-resources.mjs --write
node --test tests/fpga-resources.test.mjs
```

The generated [`device-resource-audit.json`](device-resource-audit.json) reports
every physical catalog entry, including pin-mapping-only entries, and fails if an
enabled hardware build target lacks a resource profile. Missing individual capacities
remain `null`; they are never filled from a similarly named FPGA or interpreted as zero.

## What changed

- The former five package-specific profiles became a shared silicon database. The
  selected board supplies its package and device label; a speed/package spelling
  does not silently erase the resource data. Unresolved identities remain unresolved.
- Memory uses **Kibit (1024 bits)** throughout. EBR/BRAM, UltraRAM, iCE40 SPRAM and
  CrossLink LRAM are separate. Distributed RAM, processor SRAM/cache, package-integrated
  SDRAM/PSRAM and board DRAM/flash are not combined into block RAM.
- Logic labels distinguish LUT4, LUT6, ALM, GateMate CPE and vendor-equivalent LE.
  Marketing-equivalent or nominal densities are explicitly labeled and must not
  become build-utilization denominators.
- DSP labels distinguish full DSP slices, MAC blocks and multiplier counts. A count
  of 18 × 18 multipliers is not assumed to equal the number of multi-multiplier slices.
- Every profile carries the manufacturer document, relevant table/section and check date.
  Build History preserves the units returned by the tool: `TRELLIS_SLICE` is “Slices”
  and `ICESTORM_LC` is “Logic cells”; neither is relabeled as a LUT count.

## Corrected discrepancies

| Device | Verified correction | Evidence |
| --- | --- | --- |
| ECP5 12F / 25F / 45F / 85F | BRAM is 32 / 56 / 108 / 208 blocks of 18 Kibit; multiplier counts are 28 / 28 / 72 / 156; PLL counts are 2 / 2 / 4 / 4. The old database had incorrect RAM, DSP and PLL values. | [Lattice family table](https://www.latticesemi.com/Products/FPGAandCPLD/ECP5) |
| iCE40UP5K | 120 Kibit EBR and 1024 Kibit SPRAM are separate; eight MAC blocks. | [Lattice UltraPlus data sheet, table 2.1](https://www.latticesemi.com/-/media/LatticeSemi/Documents/DataSheets/iCE/iCE40-UltraPlus-Family-Data-Sheet.ashx) |
| Artix-7 | A35T has 20,800 physical LUT6s, rather than its 33,280 equivalent logic-cell rating. LUT and FF values are derived from the documented per-slice resources. | [AMD DS180, tables 2–8](https://docs.amd.com/v/u/en-US/ds180_7Series_Overview) |
| GW2AR-18 QN88 | Its package exposes two PLLs, rather than the family maximum of four. | [Gowin DS226, package memory/PLL table](https://cdn.gowinsemi.com.cn/DS226E.pdf) |
| Efinix Trion/Titanium | Block capacities are calculated from 5120-bit / 10240-bit primitives; decimal marketing kbit/Mbit figures are not displayed as binary Kibit. PLL availability is package-specific. | [Trion T20](https://www.efinixinc.com/shop/t20.php), [Titanium Ti60](https://www.efinixinc.com/shop/ti60.php) |
| Topaz Tz170 | Uses corrected 161,008 equivalent LEs and eight PLLs, rather than the early overview's 172,008 LEs and ten PLLs. | [Efinix data sheet tables 1–2](https://www.efinixinc.com/docs/topaz170-ds-v1.1.pdf) |
| Anlogic EG4S20 | Uses DS301 2.7.6 (2024.10): 19,600 LUTs/FFs and four PLLs. Older v1.4 mirrored files list 23,520 LUTs and three PLLs. Its 64 × 9-Kibit plus 16 × 32-Kibit ERAM inventory is 1088 Kibit, excluding SDRAM. | [Anlogic DS301](https://anlogic.oss-cn-shanghai.aliyuncs.com/web_doc/%E5%B7%A5%E5%85%B7%E4%B8%8E%E8%B5%84%E6%96%99%E4%B8%8B%E8%BD%BD/%E6%8A%80%E6%9C%AF%E6%96%87%E6%A1%A3/EG4/%E6%95%B0%E6%8D%AE%E6%89%8B%E5%86%8C/DS301_EG4S20_Datasheet_en.pdf) |
| MachXO3L-6900 | Its 26 × 9216-bit EBRs total 234 Kibit. The overview's 240-Kbit figure is decimal and rounded. | [Lattice DS02032, figure 2.2 and section 2.5](https://www.latticesemi.com/view_document?document_id=50121) |

## Resource sources by silicon family

The complete source registry, section references and per-part values live in
`FPGA_RESOURCE_SOURCES` and `FPGAS`. Core references are:

| Family | Primary documentation |
| --- | --- |
| iCE40 LP/HX | [Lattice family data sheet](https://www.latticesemi.com/~/media/LatticeSemi/Documents/DataSheets/iCE/iCE40LPHXFamilyDataSheet.pdf) |
| Spartan-6 | [AMD LX/LXT product tables](https://www.amd.com/en/products/adaptive-socs-and-fpgas/fpga/spartan-6.html) |
| Spartan-7 / Artix-7 / Kintex-7 / Virtex-7 | [AMD DS180](https://docs.amd.com/v/u/en-US/ds180_7Series_Overview) |
| Zynq-7000 | [AMD DS190](https://docs.amd.com/v/u/en-US/ds190-Zynq-7000-Overview) |
| UltraScale / UltraScale+ / Zynq MPSoC and RFSoC | [AMD DS890](https://docs.amd.com/v/u/en-US/ds890-ultrascale-overview) |
| Kria K26 | [AMD DS987 PL resources](https://docs.amd.com/r/en-US/ds987-k26-som/Programmable-Logic) |
| Alveo U200/U250 | [AMD DS962 total-card resources](https://docs.amd.com/r/en-US/ds962-u200-u250/Alveo-Product-Details); dynamic Vitis regions are smaller |
| Cyclone III / IV / V / 10 LP | [Cyclone III table](https://cdrdv2-public.intel.com/655476/wp-01046-developing-msan-equipment-using-low-cost-fpgas.pdf), [IV handbook](https://cdrdv2-public.intel.com/653974/cyclone4-handbook.pdf), [V resource table](https://cdrdv2-public.intel.com/714207/cyclone-v-product-table.pdf), [10 LP overview](https://cdrdv2-public.intel.com/666875/c10lp-51001-683879-666875.pdf) |
| MAX 10 | [Altera resource table](https://cdrdv2-public.intel.com/714204/max-10-product-table.pdf) |
| Agilex 3 / 5 | [C-Series overview](https://docs.altera.com/r/docs/817231/current/agilextm-3-fpgas-and-socs-device-overview/agilextm-3-fpgas-and-socs-c-series), [E-Series overview](https://docs.altera.com/r/docs/762191/current/agilex-5-fpgas-and-socs-device-overview/agilex-5-fpgas-and-socs-e-series) |
| Gowin LittleBee / Arora II / Arora V | [GW1N DS100](https://cdn.gowinsemi.com.cn/DS100E.pdf), [LittleBee tables](https://www.gowinsemi.com/en/product/littlebee_fpga/), [Arora II](https://www.gowinsemi.com/en/product/arora-ii-fpga), [Arora V](https://www.gowinsemi.com/en/product/arora-v-fpga/) |
| Efinix | [T8](https://www.efinixinc.com/shop/t8.php), [T20](https://www.efinixinc.com/shop/t20.php), [T120](https://www.efinixinc.com/shop/t120.php), [Ti60](https://www.efinixinc.com/shop/ti60.php), [Ti375](https://www.efinixinc.com/shop/ti375.php), [Tz170](https://www.efinixinc.com/docs/topaz170-ds-v1.1.pdf) |
| GateMate | [Cologne Chip A1 resources](https://colognechip.com/programmable-logic/gatemate/overview/) |
| QuickLogic EOS S3 | [Technical reference manual, FPGA fabric resources](https://www.quicklogic.com/wp-content/uploads/2024/11/QL-S3-Technical-Reference-Manual.pdf) |
| Microchip IGLOO2 / PolarFire | [IGLOO2 resource table](https://ww1.microchip.com/downloads/en/DeviceDoc/00003294A.pdf), [PolarFire product table](https://www.microchip.com/en-us/products/fpgas-and-plds/fpgas/polarfire-fpgas) |
| CrossLink-NX | [Lattice selection table](https://www.latticesemi.com/Products/FPGAandCPLD/CrossLink-NX) |
| Anlogic SALDRAGON DR1 | [Manufacturer PL resource table](https://www.anlogic.com/product/fpga/saldragon/dr1) |

## Deliberate remaining gaps

The generated JSON lists the exact affected board IDs and reasons. These gaps are
not filled from guessed family maxima:

- Family-only or configurable modules (`UNKNOWN`, `LFCPNX`, `LIFCL`, etc.) need an
  identified populated density and revision before a silicon profile can be selected.
- `microsoft-catapult-v3` uses the nonstandard engineering identifier `10AXF40GAE`.
  Third-party claims about an equivalent production Arria part are insufficient evidence.
- `xilinx-alveo-u280` names an **ES1** device. The [production DS963 table](https://docs.amd.com/r/en-US/ds963-u280/Alveo-Product-Details)
  explicitly defers ES1 differences to a separate answer record; production capacities
  are not silently assigned to that revision.
- `rcs-arctic-tern-bmc-card` is held behind the catalog's conflicting-identity flag.
  A resource lookup never overrides that flag.
- Several verified profiles intentionally omit fields not yet established for the selected
  package (notably PLL counts) or totals not proved by the referenced table. The UI shows
  “Not verified” for those fields.

## Verification

`fpga-resources.test.mjs` checks aliases, ECP5 corrections, iCE40 RAM separation,
LUT/FF conventions, Gowin package PLL limits, memory-block arithmetic, source metadata,
unresolved identities, capability gating and tool-reported utilization units. These tests
validate the application data model; they do not claim a physical board was programmed.
