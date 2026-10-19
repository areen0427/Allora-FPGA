# Catalog device/package label audit

Audit date: 2026-10-16. `src/data/boards/catalogIdentity.ts` separates AMD device and package fields from the exact published FPGA part already recorded on each board. It does not select an assembly, guess an FPGA density, change `fpgaId`, clear `identityUnresolved`, or enable a project/build/programming capability.

The generic catalog previously treated speed grades such as `1`, `2`, `3`, or `1L` as physical packages when a LiteX part string concatenated device and package. For example, source part `xc7a200tfbg484-1` means device `XC7A200T` in package `FBG484`; its final `-1` is not a package. Spartan-6 source strings put the speed before the package (`xc6slx9-2-tqg144`), while UltraScale strings commonly separate all fields (`xcau15p-ffvb676-2-i`).

Applied to the 216 generic catalog records at review time, the helper corrects labels on **41 boards**, including **38 numeric speed-grade-as-package errors** and two previously unknown FFVB676 packages. The remaining changed record separates the industrial source part's device/package labels while preserving its complete part ID. All source part strings remain unchanged for toolchain and resource matching.

Primary format/package references:

- [AMD 7 Series Packaging and Pinout Product Specification, UG475](https://docs.amd.com/api/khub/documents/kHyYQ6XzXnQwR2O~gaV~MQ/content): package identifiers such as CSG324, FBG484, FGG484 and FFG1761.
- [AMD Spartan-6 Package Device Pinout Files](https://www.amd.com/pt/developer/resources/adaptive-socs-and-fpgas/package-pinout-files/spartan-6-package-device-pinout-files.html): device/package combinations including XC6SLX9/TQG144.
- [AMD UltraScale Packaging and Pinouts, UG575](https://docs.amd.com/api/khub/documents/GnuVZDIoTcrlIuu8Aok5XQ/content): UltraScale/UltraScale+ package identifiers.
- [AMD Artix UltraScale+ PCIe device/package table, PG213](https://docs.amd.com/r/en-US/pg213-pcie4-ultrascale-plus/Available-Integrated-Blocks-for-PCI-Express): XCAU15P and XCAU25P in FFVB676.

The full part values are sourced by the board's existing immutable LiteX platform provenance. A finite AMD package-prefix list prevents the normalizer from swallowing a trailing silicon letter as part of a package name. Unrecognized parts remain unchanged; if a legacy package is only a numeric speed grade and cannot be resolved, it becomes `unknown` with an explanatory verification note. Non-AMD ordering formats are deliberately not reinterpreted by this helper.

Focused tests in `allora-fpga/tests/catalog-identity.test.mjs` cover published glued and separated formats, Spartan-6 field ordering, UltraScale+, unresolved identities, idempotence, and preservation of all non-label fields.
