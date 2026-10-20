import {
  parseVivadoProject,
  resolveVivadoPath,
  importVivadoProject,
} from "../src/lib/vivadoProject";

const results: string[] = [];
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
  results.push(`PASS ${name}`);
}
function rejects(name: string, run: () => unknown) {
  try {
    run();
  } catch {
    results.push(`PASS ${name}`);
    return;
  }
  throw new Error(`${name}: expected rejection`);
}
const xml = `<?xml version="1.0"?><Project><FileSets><FileSet Name="sources_1" Type="DesignSrcs">
<File Path="$PPRDIR/rtl/top.sv"><FileInfo><Attr Name="UsedIn" Val="synthesis"/></FileInfo></File>
<File Path="$PSRCDIR/sources_1/imports/child.v"/>
<File Path="$PGENDIR/sources_1/bd/design/hdl/design_wrapper.v"/>
<File Path="$PPRDIR/disabled.v"><FileInfo><Attr Name="IsEnabled" Val="false"/></FileInfo></File>
<File Path="$PPRDIR/test.v"><FileInfo><Attr Name="UsedIn" Val="simulation"/></FileInfo></File>
<File Path="$PPRDIR/ip.xci"/><File Path="$PPRDIR/top.xdc"/>
<Config><Option Name="TopModule" Val="top"/></Config></FileSet>
<FileSet Name="sim_1" Type="SimulationSrcs"><File Path="$PPRDIR/tb.v"/></FileSet></FileSets></Project>`;
async function run() {
  check(
    "relative path",
    resolveVivadoPath("/projects/blink/blink.xpr", "../rtl/top.v"),
    "/projects/rtl/top.v",
  );
  check(
    "braced path variable",
    resolveVivadoPath("/projects/blink/blink.xpr", "${PPRDIR}/rtl/top.v"),
    "/projects/blink/rtl/top.v",
  );
  check(
    "Windows paths",
    resolveVivadoPath("C:\\work\\blink.xpr", "$PSRCDIR\\sources_1\\top.v"),
    "C:/work/blink.srcs/sources_1/top.v",
  );
  rejects("unresolved variables", () =>
    resolveVivadoPath("/work/blink.xpr", "$UNKNOWN/file.v"),
  );
  const parsed = parseVivadoProject(xml, "/projects/blink/blink.xpr");
  check("project top", parsed.topModule, "top");
  check("synthesis source set and generated paths", parsed.sourcePaths, [
    "/projects/blink/rtl/top.sv",
    "/projects/blink/blink.srcs/sources_1/imports/child.v",
    "/projects/blink/blink.gen/sources_1/bd/design/hdl/design_wrapper.v",
  ]);
  check(
    "IP diagnostics",
    parsed.warnings.some((warning) => warning.includes("ip.xci")),
    true,
  );
  rejects("malformed XML", () =>
    parseVivadoProject("<Project><FileSets></Project>", "/a.xpr"),
  );
  rejects("DTD", () =>
    parseVivadoProject("<!DOCTYPE Project><Project/>", "/a.xpr"),
  );
  rejects("non-project XML", () => parseVivadoProject("<Other/>", "/a.xpr"));
  rejects("missing wrapper/source", () =>
    parseVivadoProject(
      '<Project><FileSets><FileSet Type="DesignSrcs"><File Path="design.bd"/></FileSet></FileSets></Project>',
      "/a.xpr",
    ),
  );
  // Exercise the typed import boundary with a labeled in-memory native response.
  const host = window as unknown as {
    __TAURI__: {
      core: {
        invoke: (
          command: string,
          args: { paths: string[] },
        ) => Promise<unknown>;
      };
    };
  };
  host.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        check("read-only native command", command, "read_pin_import_files");
        return args.paths.map((path) => ({
          path,
          content: path.endsWith(".xpr")
            ? xml
            : path.endsWith("top.sv")
              ? "module top(output [9:8] led); endmodule"
              : "module child(output unused); endmodule",
        }));
      },
    },
  };
  const imported = await importVivadoProject("/projects/blink/blink.xpr");
  check("project import top", imported.topModule, "top");
  check(
    "project import output indices",
    imported.units[0].outputs[0].indices,
    [9, 8],
  );
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  document.querySelector("#result")!.textContent =
    `${results.join("\n")}\n${results.length} checks passed. Native responses in this fixture are in memory.`;
}
void run().catch((error) => {
  document.querySelector("#result")!.textContent =
    `${results.join("\n")}\nFAIL ${error.message}`;
  throw error;
});
