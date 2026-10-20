# Pin Mapper design import

Open **Pin Mapper → board → Map Outputs → Import design**. Choose a Verilog/SystemVerilog/VHDL file (`.v`, `.sv`, `.vhd`, `.vhdl`) or, in the desktop app, a Vivado `.xpr` project. Choose the intended top-level module/entity when ambiguous. Vivado's saved `TopModule` is preselected when found unambiguously.

Review the output names, bit counts and ranges, then **Add outputs**. Existing names are skipped case-insensitively, matching the manual form; their widths and assignments are preserved. Assign pads manually and Save mapping to prepare the board-specific download. Accepting new outputs invalidates that download. Failed, cancelled and duplicate-only imports preserve it. Accepted outputs survive Pin Catalog/Board Data visits; changing boards or leaving the mapper session resets the draft as before.

The review uses the anchored Product Information glass popup, without a backdrop. It fits the viewport, scrolls, honors both reduced-motion preferences, dismisses on outside click/Escape, and restores trigger focus on Escape/Cancel/accept. Pending reads cannot apply after dismissal, navigation or board changes.

## Supported syntax and limits

- ANSI/non-ANSI Verilog module declarations, scalar outputs, one packed dimension, ordinary names, grouped declarations, and `wire`, `reg`, `logic`, `signed`, `unsigned` qualifiers. Comments, strings and task/function declarations do not contribute ports.
- VHDL entities with `out`/`buffer`, grouped names, scalar `std_logic`/`std_ulogic`/`bit`, or one-dimensional `std_logic_vector`, `std_ulogic_vector`, `signed`, `unsigned`, `bit_vector` using `to`/`downto` ranges.
- Decimal integer parameter/generic defaults, earlier constants, parentheses, unary signs and basic `+`, `-`, `*`, `/` arithmetic with integer results. Defaults are used; project/module parameter overrides are not elaborated.
- Declared indices are retained: `[9:8]` becomes `status[9]` and `status[8]`; `[4:4]` remains a vector bit. Ascending ranges also retain their order.

This parses declarations without running a compiler. Unsupported or unresolved output declarations reject the selected top as a whole. Preprocessor-dependent interfaces, includes affecting the interface, attributes, escaped/`$` output names, typedef/interface ports, package-dependent types, complex constant functions, multidimensional/unpacked arrays and unsupported initializers need a simplified top-level file with resolved ranges. Inputs and bidirectional ports are excluded.

Limits: 2 MiB/file, 256 files, 4096 bits/output declaration and 16384 output bits/top. Native requests also enforce 16 MiB aggregate, UTF-8 text, allowlisted extensions and regular files.

## Vivado behavior

The XML reader selects one `DesignSrcs` set, its direct synthesis HDL references and `TopModule`. It excludes disabled and simulation-only files. Relative paths resolve against the `.xpr` directory; `$PPRDIR`, `$PSRCDIR`, `$PGENDIR` and braced forms are supported. Absolute paths are used as saved. Unknown variables, missing files, malformed XML and unsupported source sets report diagnostics.

IP/block designs require an existing generated HDL wrapper. The importer can read a referenced wrapper but never runs Tcl, project hooks, IP generators or Vivado. XDC assignments, board selection and source files are unchanged. This does not implement Board Migration Assistant or change the project workspace's separate pin mapper.

## Engineering and repeatable checks

`lib/portImport.ts` owns the import model, parsing, expansion and merge rules. `lib/vivadoProject.ts` parses XML and calls the typed read-only native service in `src-tauri/src/pin_import.rs`. `PinOutputImport.tsx` owns the review; `WelcomeOutputMapper.tsx` accepts additions. Paths are relative to `allora-fpga/src` unless otherwise indicated.

Run `npm test`, `npm run lint`, `npm run build`; from `src-tauri`, run `cargo test --locked --lib`. Parser regressions cover module isolation, parameters, VHDL, unsupported declarations, merging and actual exported constraints. Native tests read real `.xpr`/HDL fixtures and check invalid requests and size limits.

With Vite running, `/tests/pin-import-browser.html` must report **15 checks passed**. It tests XML, project paths, filtering, diagnostics and the typed import pipeline with explicitly labeled in-memory native responses. `tests/fixtures/pin-import/blink.xpr` and `top.sv` are available for manual native import.

Actual Welcome browser checks covered multi-module top selection, `[9:8]` preservation, three pad assignments, prepared XDC download, duplicate preservation, Escape, tab retention, Ice/Black Ice and 1440/390px layouts. No packaged native picker interaction, real user Vivado project, vendor implementation or physical hardware verification was performed.
