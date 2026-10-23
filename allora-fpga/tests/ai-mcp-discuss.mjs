import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient, toolValue } from "./helpers/mcp-client.mjs";

// Explicit integration smoke: run after cargo build, without a model/account or
// toolchain execution. Scratch data and every attempted write stay in this lane.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary = process.env.ALLORA_MCP_BINARY ?? path.join(app, "src-tauri/target/debug/app");
const target = path.join(app, "src-tauri/target");
await mkdir(target, { recursive: true });
const workspace = await mkdtemp(path.join(target, "allora-discuss-smoke-"));
const projectPath = path.join(workspace, "project");
const catalogPath = path.join(workspace, "boards.json");
const boardId = "allora-virtual";
const clients = [];

async function snapshot(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push([`${name}/`, null]);
      files.push(...await snapshot(path.join(directory, entry.name), name));
    } else files.push([name, (await readFile(path.join(directory, entry.name))).toString("base64")]);
  }
  return files.sort(([left], [right]) => left.localeCompare(right));
}

function client(mode) {
  const connection = new McpClient(binary, {
    ALLORA_WORKSPACE_PATH: workspace,
    ALLORA_BOARD_CATALOG_PATH: catalogPath,
    ALLORA_CHAT_MODE: mode,
  });
  clients.push(connection);
  return connection;
}

try {
  await mkdir(path.join(projectPath, "src"), { recursive: true });
  await writeFile(catalogPath, JSON.stringify([{
    id: boardId, name: "Allora Virtual FPGA", family: "Virtual", package: "Virtual",
    fpgaId: "virtual", synthesisFlow: "virtual", constraintsFile: "pcf", toolchain: {},
  }]));
  await writeFile(path.join(projectPath, "allora-project.json"), JSON.stringify({
    name: "Discuss smoke", boardId, language: "Verilog", topModule: "top",
  }));
  const rtl = "module top(output wire led); assign led = 1'b0; endmodule\n";
  await writeFile(path.join(projectPath, "src/top.v"), rtl);
  const before = await snapshot(workspace);

  const discuss = client("discuss");
  await discuss.initialize();
  const inventory = (await discuss.request("tools/list", {})).tools;
  const names = new Set(inventory.map((tool) => tool.name));
  assert.ok(names.has("read_file"));
  assert.ok(names.has("get_project_context"));
  assert.ok(inventory.every((tool) => tool.annotations.readOnlyHint === true));
  assert.ok(!names.has("cancel_all_jobs"), "host cleanup stays out of the model inventory");
  const source = toolValue(await discuss.call("read_file", { projectPath, path: "src/top.v" }));
  assert.equal(source.content, rtl);
  assert.equal(typeof source.revision, "string");
  const context = toolValue(await discuss.call("get_project_context", { projectPath }));
  assert.equal(context.metadata.language, "Verilog");

  // Valid argument shapes ensure these reach the execution gate rather than
  // passing merely because schema validation rejected an incomplete request.
  const blocked = [
    ["apply_file_changes", { projectPath, changes: [
      { path: "src/top.v", content: "overwritten", expectedRevision: source.revision },
      { path: "src/blocked.v", content: "created", expectedRevision: null },
    ] }],
    ["create_project", { name: "Blocked", boardId, parentDirectory: workspace, language: "vhdl" }],
    ["configure_project", { projectPath, topModule: "changed", language: "vhdl" }],
    ["set_pin_assignments", { projectPath, assignments: [{ port: "led", boardPin: "LED" }] }],
    ["configure_simulator", { projectPath, clockFrequencyHz: 1000000,
      peripherals: [{ type: "led", signal: "led" }] }],
    ["compile_simulator", { projectPath, cycles: 1 }],
    ["generate_synthesis_diagram", { projectPath }],
    ["simulate_testbench", { projectPath, testbenchPath: "sim/top_tb.v", topModule: "top_tb" }],
    ["build_bitstream", { projectPath }],
    ["program_board", { projectPath, artifactId: "untrusted-artifact" }],
  ];
  for (const [name, args] of blocked) {
    assert.ok(!names.has(name), `${name} is hidden in Discuss`);
    const result = await discuss.request("tools/call", {
      name, arguments: args, _meta: { mode: "edit", threadId: "child-agent" },
    });
    assert.equal(result.isError, true, name);
    assert.match(result.content.map((part) => part.text ?? "").join("\n"), /Discuss mode/, name);
  }
  assert.deepEqual(toolValue(await discuss.call("cancel_all_jobs", {})).cancelledJobIds, []);
  const cancel = await discuss.call("cancel_job", { jobId: "missing" });
  assert.equal(cancel.isError, true);
  assert.match(cancel.content[0].text, /Unknown job ID/);
  assert.deepEqual(discuss.elicitations, [], "blocked creation/programming never opens a form");
  assert.deepEqual(await snapshot(workspace), before, "Discuss preserves every file and path");
  await discuss.close();

  const edit = client("edit");
  await edit.initialize();
  const editInventory = (await edit.request("tools/list", {})).tools;
  const editNames = new Set(editInventory.map((tool) => tool.name));
  for (const [name] of blocked) assert.ok(editNames.has(name), `${name} is available after reconnecting in Edit`);
  assert.ok(editNames.has("cancel_all_jobs"));
  assert.deepEqual(editInventory.find((tool) => tool.name === "create_project")
    .inputSchema.properties.language.enum, ["verilog", "systemverilog", "vhdl"]);
  assert.deepEqual(await snapshot(workspace), before);
  console.log(`Allora Discuss MCP PASS: real stdio inventory, source read, ${blocked.length} blocked mutators, child metadata bypass rejected, cleanup, unchanged workspace, and Edit reconnect.`);
} finally {
  for (const connection of clients) await connection.close();
  await rm(workspace, { recursive: true, force: true });
}
