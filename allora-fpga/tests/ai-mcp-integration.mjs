import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { McpClient, toolValue } from "./helpers/mcp-client.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary = process.env.ALLORA_MCP_BINARY ?? path.join(app, "src-tauri/target/debug/app");
const target = path.join(app, "src-tauri/target");
await mkdir(target, { recursive: true });
const workspace = await mkdtemp(path.join(target, "allora-ai-test-"));
const catalogPath = path.join(workspace, "boards.json");
// Use the actual checked-in board definition; do not invent hardware metadata.
const boardSource = await readFile(path.join(app, "src/data/boards/icebreaker.ts"), "utf8");
const boardJs = ts.transpileModule(boardSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { icebreaker } = await import(`data:text/javascript;base64,${Buffer.from(boardJs).toString("base64")}`);
await writeFile(catalogPath, JSON.stringify([icebreaker]));
const client = new McpClient(binary, {
  ALLORA_WORKSPACE_PATH: workspace,
  ALLORA_BOARD_CATALOG_PATH: catalogPath,
});

async function call(name, args) { return toolValue(await client.call(name, args)); }
async function job(name, args) {
  const started = await call(name, args);
  const deadline = Date.now() + 90000;
  for (;;) {
    const result = await call("get_job_result", { jobId: started.jobId });
    if (!["running", "cancelling"].includes(result.status)) {
      assert.equal(result.status, "succeeded", JSON.stringify(result));
      return result;
    }
    assert.ok(Date.now() < deadline, `${name} timed out`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const rtl = `module top #(parameter HALF_PERIOD = 6000000) (
  input wire clk, output reg led_n = 1'b1
);
  localparam WIDTH = (HALF_PERIOD < 2) ? 1 : $clog2(HALF_PERIOD);
  reg [WIDTH-1:0] count = 0;
  always @(posedge clk) begin
    if (count == HALF_PERIOD-1) begin
      count <= 0;
      led_n <= ~led_n;
    end else count <= count + 1'b1;
  end
endmodule
`;
const tb = "`timescale 1ns/1ps\n" + `module top_tb;
  reg clk = 0;
  wire led_n;
  integer cycle;
  top #(.HALF_PERIOD(6)) dut(.clk(clk), .led_n(led_n));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("blink.vcd"); $dumpvars(0, top_tb);
    for (cycle = 1; cycle <= 24; cycle = cycle + 1) begin
      @(posedge clk); #1;
      if (led_n !== (1'b1 ^ ((cycle/6) % 2))) $fatal(1, "Wrong LED state at cycle %0d", cycle);
    end
    $display("BLINK_TEST_PASS"); $finish;
  end
endmodule
`;

try {
  await client.initialize();
  const inventory = await client.request("tools/list", {});
  assert.ok(inventory.tools.some((tool) => tool.name === "build_bitstream"));
  assert.ok(inventory.tools.some((tool) => tool.name === "cancel_all_jobs"));
  const board = await call("get_board_definition", { boardId: "icebreaker" });
  assert.equal(board.clocks.find((clock) => clock.name === "clk12").frequency, 12000000);
  const tools = await call("get_toolchain_status", { boardId: "icebreaker" });
  for (const command of ["yosys", "nextpnr-ice40", "icepack", "iverilog", "vvp"]) {
    assert.equal(tools.tools.find((tool) => tool.command === command)?.installed, true, `${command} is required for this integration test`);
  }
  const project = await call("create_project", { name: "LED Blink Integration", boardId: "icebreaker", topModule: "top" });
  const projectPath = project.projectPath;
  await call("apply_file_changes", { projectPath, changes: [
    { path: "src/top.sv", content: rtl, expectedRevision: null },
    { path: "sim/top_tb.sv", content: tb, expectedRevision: null },
  ] });
  const rejected = await client.call("apply_file_changes", { projectPath, changes: [
    { path: "new.sv", content: "should not be written", expectedRevision: null },
    { path: "src/top.sv", content: "overwrite", expectedRevision: "wrong" },
  ] });
  assert.equal(rejected.isError, true);
  assert.equal((await call("read_file", { projectPath, path: "new.sv" })).exists, false);
  const escaped = await client.call("read_file", { projectPath, path: "../boards.json" });
  assert.equal(escaped.isError, true);
  await call("set_pin_assignments", { projectPath, assignments: [
    { port: "clk", boardPin: "clk12" }, { port: "led_n", boardPin: "rgb_red" },
  ] });
  const lint = await call("lint_hdl", { projectPath });
  assert.equal(lint.available, true);
  assert.equal(lint.diagnostics.filter((entry) => entry.severity === "error").length, 0);
  const simulation = await job("simulate_testbench", { projectPath, testbenchPath: "sim/top_tb.sv", topModule: "top_tb" });
  assert.ok(simulation.logs.some((line) => line.includes("BLINK_TEST_PASS")));
  assert.ok(simulation.result.vcdBytes > 0);
  const build = await job("build_bitstream", { projectPath });
  assert.ok(build.result.bytes > 0);
  assert.equal(build.result.boardId, "icebreaker");
  assert.equal(build.result.timing.status, "pass", JSON.stringify(build.result.timing));
  assert.ok((await readFile(build.result.artifactPath)).length > 0);
  // Even a valid artifact never reaches the programmer after a declined prompt.
  const declined = await client.call("program_board", { projectPath, artifactId: build.result.artifactId });
  assert.equal(declined.isError, true);
  assert.ok(client.elicitations.some((request) => request.method === "elicitation/create"));
  assert.match(declined.content[0].text, /declined|cancelled/i);
  const source = await call("read_file", { projectPath, path: "src/top.sv" });
  await call("apply_file_changes", { projectPath, changes: [
    { path: "src/top.sv", content: rtl + "// changed after build\n", expectedRevision: source.revision },
  ] });
  const stale = await client.call("program_board", { projectPath, artifactId: build.result.artifactId });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /stale/i);
  console.log("Allora MCP PASS: real board catalog, project, transactional edits, scope, verified pins, lint, simulation, bitstream/timing, declined upload and stale artifact rejection.");
} finally {
  await client.close();
  await rm(workspace, { recursive: true, force: true });
}
