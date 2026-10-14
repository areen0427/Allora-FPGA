import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/projectDiagnosticMemory.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
}).outputText;

function harness(desktop = true, invoke = async () => {}) {
  const calls = [];
  const exports = {};
  new Function("require", "exports", code)(() => ({
    hasTauriInvoke: () => desktop,
    invokeTauri: async (command, args) => { calls.push({ command, args }); await invoke(); },
  }), exports);
  return { sync: exports.syncProjectDiagnosticMemory, calls };
}
const entry = version => ({ id: "error-1", version, projectPath: "/projects/blink" });
const tick = () => new Promise(resolve => setImmediate(resolve));

test("ordinary sends reuse completed native memory without another IPC call", async () => {
  const { sync, calls } = harness();
  await sync([entry(1)]);
  await sync([entry(1)]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "sync_project_diagnostic_memory");
  await sync([]);
  assert.equal(calls.length, 2, "expired or removed memory is synchronized");
});

test("sync coalesces bursts to a cloned latest snapshot", async () => {
  const { sync, calls } = harness();
  const latest = entry(3);
  const promises = [sync([entry(1)]), sync([entry(2)]), sync([latest])];
  latest.version = 99;
  await Promise.all(promises);
  assert.deepEqual(calls.map(call => call.args.entries[0].version), [3]);
});

test("an in-flight change cannot replace a newer return to the previous snapshot", async () => {
  const releases = [];
  const { sync, calls } = harness(true, () => new Promise(resolve => releases.push(resolve)));
  const initial = sync([entry(1)]);
  await tick(); releases.shift()(); await initial;
  const change = sync([entry(2)]);
  await tick();
  const restore = sync([entry(1)]);
  releases.shift()(); await change;
  await tick(); releases.shift()(); await restore;
  assert.deepEqual(calls.map(call => call.args.entries[0].version), [1, 2, 1]);
});

test("failed syncs retry and browser previews never create native traffic", async () => {
  let fail = true;
  const { sync, calls } = harness(true, async () => { if (fail) throw new Error("native unavailable"); });
  await assert.rejects(sync([entry(1)]), /native unavailable/);
  fail = false;
  await sync([entry(1)]);
  assert.equal(calls.length, 2);
  const browser = harness(false);
  await browser.sync([entry(1)]);
  assert.deepEqual(browser.calls, []);
});
