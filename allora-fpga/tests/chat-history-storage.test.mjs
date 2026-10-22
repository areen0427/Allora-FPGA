import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/chatHistory.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let serial = 0;
const historyKey = "allora-codex-conversations-v1";
const indexKey = "allora-codex-conversations-index-v2";
const chat = (id = "one") => ({ id, title: `Chat ${id}`, workspacePath: `/projects/${id}`, updatedAt: "2026-10-22T12:00:00Z",
  messages: [{ id: "user", role: "user", text: "Build my counter" }, { id: "reply", role: "assistant", text: "Working on the counter", pending: true }] });

async function fixture(options = {}) {
  const values = new Map();
  if (options.legacy) values.set(historyKey, JSON.stringify(options.legacy));
  const state = { stored: options.stored, writes: [], ...options };
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (state.localFull || (state.indexFull && key === indexKey) || value.length > (state.localLimit ?? Infinity)) throw new DOMException("Quota exceeded", "QuotaExceededError");
      values.set(key, value);
    },
    removeItem: key => values.delete(key),
  };
  const db = {
    close() {}, createObjectStore() {},
    transaction(_name, mode) {
      const transaction = { error: null, objectStore: () => ({
        get() {
          const request = {};
          queueMicrotask(() => {
            if (state.readError) { request.error = new Error("Read failed"); request.onerror?.(); }
            else { request.result = structuredClone(state.stored); request.onsuccess?.(); }
          });
          return request;
        },
        put(value) {
          assert.equal(mode, "readwrite");
          const frozen = structuredClone(value);
          state.writes.push(frozen);
          setTimeout(() => {
            if (state.writeError) { transaction.error = new Error("Database full"); transaction.onerror?.(); }
            else { state.stored = frozen; transaction.oncomplete?.(); }
          }, state.writeDelay ?? 0);
        },
      }) };
      return transaction;
    },
  };
  const indexedDB = options.noIndexedDB ? undefined : {
    open() {
      const request = {};
      queueMicrotask(() => {
        if (state.openError) { request.error = new Error("Open failed"); request.onerror?.(); }
        else { request.result = db; request.onsuccess?.(); }
      });
      return request;
    },
  };
  globalThis.window = { indexedDB, localStorage };
  const reload = () => import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}#${serial++}`);
  return { state, values, api: await reload(), reload };
}

test("legacy history migrates only after a committed database save, retaining pending turns and full tool details", async () => {
  const pending = chat();
  pending.messages[1].tools = [{ id: "tool", name: "read_file", status: "running", output: "x".repeat(10000) }];
  const h = await fixture({ legacy: [pending] });
  assert.deepEqual(await h.api.loadChatHistory(), [pending]);
  assert.ok(h.values.has(historyKey), "loading alone never deletes the old transcript");
  await h.api.saveChatHistory([pending]);
  assert.deepEqual(h.state.stored.conversations, [pending]);
  assert.equal(h.values.has(historyKey), false);
  assert.ok(h.values.has(indexKey));
  const cold = await h.reload();
  assert.equal(cold.hasSavedProjectChat("/projects/one"), true, "the project resume hint is synchronous on a cold launch");
  assert.deepEqual(await cold.loadChatHistory(), [pending]);
});

test("IndexedDB saves remain successful when localStorage and its optional index are full", async () => {
  const h = await fixture({ localFull: true });
  await h.api.saveChatHistory([chat()]);
  assert.equal(h.state.stored.conversations[0].id, "one");
  assert.equal(h.api.hasSavedProjectChat("/projects/one"), true);
});

test("browsers without IndexedDB compact duplicate tool/context payloads while preserving transcript and result cards", async () => {
  const pending = chat();
  pending.messages[0].pins = [{ id: "pin", label: "Counter source", text: "x".repeat(20000) }];
  pending.messages[1].tools = [{ id: "tool", name: "read_file", status: "complete", input: "x".repeat(20000), output: "x".repeat(20000) }];
  pending.messages[1].artifacts = [{ id: "result", kind: "waveform", projectPath: "/projects/one", path: "/projects/one/counter.vcd", label: "Waveform" }];
  const h = await fixture({ noIndexedDB: true, localLimit: 3000 });
  await h.api.loadChatHistory();
  await h.api.saveChatHistory([pending]);
  const cold = await h.reload();
  const saved = (await cold.loadChatHistory())[0];
  assert.deepEqual(saved.messages.map(message => message.text), pending.messages.map(message => message.text));
  assert.equal(saved.messages[1].pending, true);
  assert.deepEqual(saved.messages[1].artifacts, pending.messages[1].artifacts);
  assert.equal(saved.messages[1].tools[0].output, undefined);
  assert.equal(saved.messages[0].pins[0].text.length, 1000);
});

test("failed saves remain retryable and do not delete legacy history", async () => {
  const h = await fixture({ legacy: [chat("old")], writeError: true, localFull: true });
  await assert.rejects(h.api.saveChatHistory([chat("new")]), /Database full/);
  assert.equal(JSON.parse(h.values.get(historyKey))[0].id, "old");
  h.state.writeError = false;
  await h.api.saveChatHistory([chat("new")]);
  assert.equal(h.state.stored.conversations[0].id, "new");
});

test("concurrent stream snapshots serialize and coalesce without an older snapshot winning", async () => {
  const h = await fixture({ writeDelay: 10 });
  await Promise.all([h.api.saveChatHistory([chat("first")]), h.api.saveChatHistory([chat("second")]), h.api.saveChatHistory([chat("last")])]);
  assert.deepEqual(h.state.writes.map(value => value.conversations[0].id), ["first", "last"]);
  assert.equal(h.state.stored.conversations[0].id, "last");
});

test("database read failures surface instead of returning an empty history that could overwrite saved chats", async () => {
  const original = { version: 2, savedAt: 5, conversations: [chat("saved")] };
  const h = await fixture({ stored: original, readError: true });
  await assert.rejects(h.api.loadChatHistory(), /Read failed/);
  assert.deepEqual(h.state.stored, original);
  assert.equal(h.state.writes.length, 0);
  h.state.readError = false;
  assert.deepEqual(await h.api.loadChatHistory(), original.conversations);
});

test("a newer fallback snapshot wins after a temporary database write failure", async () => {
  const h = await fixture({ stored: { version: 2, savedAt: 1, conversations: [chat("old")] }, writeError: true });
  await h.api.saveChatHistory([chat("new")]);
  const cold = await h.reload();
  assert.equal((await cold.loadChatHistory())[0].id, "new");
});

test("fallback timestamps stay newer when wall-clock time ties or moves backwards", async () => {
  const h = await fixture({ stored: { version: 2, savedAt: Date.now() + 60000, conversations: [chat("old")] }, writeError: true });
  await h.api.loadChatHistory();
  await h.api.saveChatHistory([chat("new")]);
  assert.ok(JSON.parse(h.values.get(historyKey)).savedAt > h.state.stored.savedAt);
  assert.equal((await (await h.reload()).loadChatHistory())[0].id, "new");
});

test("a local fallback wins an equal timestamp after a failed database write", async () => {
  const h = await fixture({ legacy: { version: 2, savedAt: 7, conversations: [chat("new")] },
    stored: { version: 2, savedAt: 7, conversations: [chat("old")] } });
  assert.equal((await h.api.loadChatHistory())[0].id, "new");
});

test("failed optional index updates do not retain stale project resume hints after deletion", async () => {
  const h = await fixture();
  await h.api.saveChatHistory([chat("old")]);
  h.state.indexFull = true;
  await h.api.saveChatHistory([]);
  assert.equal(h.api.hasSavedProjectChat("/projects/old"), false);
  assert.equal((await h.reload()).hasSavedProjectChat("/projects/old"), false);
});
