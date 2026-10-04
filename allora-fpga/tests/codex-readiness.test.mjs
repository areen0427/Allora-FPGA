import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/codexReadiness.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace(/^import .*;\n/gm, "");
let importId = 0;
async function load(status, models) {
  globalThis.codexReadinessHarness = { aiIntegrationApi: { status }, aiChatApi: { models } };
  const code = `const { aiIntegrationApi, aiChatApi } = globalThis.codexReadinessHarness;\n${compiled}\n// ${importId++}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const ready = { provider: "codex", state: "ready", installed: true, authenticated: true };
const catalog = [{ model: "gpt-6.1-sol", isDefault: true }];

test("startup and early chat share one request; later chat uses prepared models immediately", async () => {
  let resolveStatus, checks = 0, catalogs = 0;
  const state = await load(() => { checks++; return new Promise(resolve => { resolveStatus = resolve; }); }, async () => { catalogs++; return catalog; });
  const startup = state.prepareCodexReadiness();
  const earlyChat = state.prepareCodexReadiness();
  assert.equal(startup, earlyChat);
  assert.equal(checks, 1);
  assert.equal(state.readCodexReadiness(), undefined);
  resolveStatus(ready);
  const result = await startup;
  assert.equal(state.readCodexReadiness(), result);
  assert.equal(result.models, catalog);
  assert.equal(await state.prepareCodexReadiness(), result);
  assert.equal(checks, 1);
  assert.equal(catalogs, 1);
});

test("Check Again refreshes account state and clears models after logout", async () => {
  let status = ready, checks = 0, catalogs = 0;
  const state = await load(async () => { checks++; return status; }, async () => { catalogs++; return catalog; });
  await state.prepareCodexReadiness();
  status = { ...ready, state: "installed_not_authenticated", authenticated: false };
  const result = await state.prepareCodexReadiness(true);
  assert.equal(checks, 2);
  assert.equal(catalogs, 1);
  assert.deepEqual(result.models, []);
  assert.equal(result.status.authenticated, false);
});

test("a failed startup check can be retried when chat opens", async () => {
  let failed = true;
  const state = await load(async () => { if (failed) throw new Error("IPC unavailable"); return ready; }, async () => catalog);
  await assert.rejects(state.prepareCodexReadiness(), /IPC unavailable/);
  assert.equal(state.readCodexReadiness(), undefined);
  failed = false;
  assert.equal((await state.prepareCodexReadiness()).models, catalog);
});

test("model discovery errors are displayed and explicit refresh recovers", async () => {
  let failed = true;
  const state = await load(async () => ready, async () => { if (failed) throw new Error("catalog unavailable"); return catalog; });
  const first = await state.prepareCodexReadiness();
  assert.equal(first.modelError, "catalog unavailable");
  assert.deepEqual(first.models, []);
  failed = false;
  const next = await state.prepareCodexReadiness(true);
  assert.equal(next.modelError, "");
  assert.equal(next.models, catalog);
});
