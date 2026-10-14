import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/projectDiagnostics.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText;
const { createProjectDiagnostics, diagnosticProjectKey, DIAGNOSTIC_LIMITS } =
  await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

function harness() {
  let stamp = Date.parse("2026-10-13T12:00:00Z");
  const store = createProjectDiagnostics(() => stamp);
  return { store, advance: (ms = 1) => { stamp += ms; } };
}

function report(store, overrides = {}) {
  return store.report({
    projectKey: "/projects/blink", projectPath: "/projects/blink", boardId: "icebreaker",
    source: "programming", message: "Unable to find the FPGA programmer", ...overrides,
  });
}

test("diagnostics are scoped to normalized project paths, including clear operations", () => {
  const { store } = harness();
  const one = report(store, { projectKey: "C:\\projects\\blink\\" });
  const two = report(store, { projectKey: "C:/projects/other" });
  assert.equal(diagnosticProjectKey("C:\\projects\\blink\\"), "C:/projects/blink");
  assert.deepEqual(store.recent("C:/projects/blink/").map(entry => entry.id), [one.id]);
  assert.deepEqual(store.recent("C:\\projects\\other\\").map(entry => entry.id), [two.id]);
  assert.deepEqual(store.recent("C:/projects/missing"), []);
  store.clear("C:/projects/other", one.id);
  assert.equal(store.recent("C:/projects/blink")[0].state, "active");
  store.clear("C:/projects/blink/", one.id);
  assert.equal(store.recent("C:/projects/blink")[0].state, "cleared");
  assert.equal(store.recent("C:/projects/other")[0].state, "active");
});

test("the in-memory buffer retains at most four projects and six observations per project", () => {
  const { store, advance } = harness();
  for (let project = 0; project < 5; project++) {
    for (let error = 0; error < 9; error++) {
      report(store, { projectKey: `/projects/${project}`, message: `Error ${error}` });
      advance();
    }
  }
  assert.deepEqual(store.recent("/projects/0"), []);
  let retained = 0;
  for (let project = 1; project < 5; project++) {
    const entries = store.recent(`/projects/${project}`);
    assert.equal(entries.length, 6);
    assert.deepEqual(entries.map(entry => entry.message), ["Error 8", "Error 7", "Error 6", "Error 5", "Error 4", "Error 3"]);
    retained += entries.length;
  }
  assert.equal(retained, DIAGNOSTIC_LIMITS.projects * DIAGNOSTIC_LIMITS.perProject);
  // A changed observation makes that project recent before the next eviction.
  report(store, { projectKey: "/projects/1", message: "Error 8", details: "new diagnostic detail" });
  report(store, { projectKey: "/projects/new" });
  assert.equal(store.recent("/projects/1").length, 6);
  assert.deepEqual(store.recent("/projects/2"), []);
});

test("messages and log tails have fixed bounds and empty errors allocate nothing", () => {
  const { store } = harness();
  assert.equal(report(store, { message: "   \n\t " }), undefined);
  assert.equal(report(store, { projectKey: "" }), undefined);
  assert.equal(store.revision(), 0);
  const entry = report(store, { title: "T".repeat(150), message: `  ${"M".repeat(1000)}  `, details: `discard-prefix${"L".repeat(4000)}-tail` });
  assert.equal(entry.title.length, 120);
  assert.equal(entry.message, "M".repeat(800));
  assert.equal(entry.details.length, 3200);
  assert.ok(entry.details.endsWith("-tail"));
  assert.ok(!entry.details.includes("discard-prefix"));
  assert.equal(DIAGNOSTIC_LIMITS.message, 800);
  assert.equal(DIAGNOSTIC_LIMITS.details, 3200);
});

test("two-hour expiry is checked lazily without reviving old observations", () => {
  const { store, advance } = harness();
  const original = report(store);
  advance(DIAGNOSTIC_LIMITS.ttlMs - 1);
  assert.equal(store.recent("/projects/blink").length, 1);
  advance();
  assert.deepEqual(store.recent("/projects/blink"), []);
  assert.equal(DIAGNOSTIC_LIMITS.ttlMs, 2 * 60 * 60 * 1000);
  const replacement = report(store);
  assert.notEqual(replacement.id, original.id);
  assert.equal(replacement.version, 1);
  assert.equal(replacement.occurrences, 1);
  assert.equal(store.recent("/projects/blink").length, 1);
});

test("unchanged errors do not notify or increment revisions on remounts", () => {
  const { store, advance } = harness();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; });
  const first = report(store, { details: "USB device unavailable" });
  const initial = { ...first };
  advance(100);
  const duplicate = report(store, { projectKey: "\\projects\\blink\\", message: `  ${first.message}  `, details: first.details });
  assert.equal(duplicate.id, first.id);
  assert.deepEqual(duplicate, initial);
  assert.equal(store.revision(), 1);
  assert.equal(notifications, 1);
  const changed = report(store, { details: "USB device disconnected" });
  assert.equal(changed.id, first.id);
  assert.equal(changed.firstSeen, first.firstSeen);
  assert.equal(changed.version, 2);
  assert.equal(changed.occurrences, 2);
  assert.equal(notifications, 2);
  unsubscribe();
  report(store, { source: "pin-mapping", message: "Unassigned clock port" });
  assert.equal(notifications, 2);
  assert.equal(store.revision(), 3);
});

test("clearing an error creates fresh context without claiming a verified fix", () => {
  const { store, advance } = harness();
  const original = report(store);
  const id = original.id;
  advance();
  store.clear("/projects/blink", id);
  const cleared = store.recent("/projects/blink")[0];
  assert.equal(cleared.state, "cleared");
  assert.equal(cleared.version, 2);
  assert.equal(cleared.occurrences, 1);
  assert.equal(store.snapshot()[0].state, "cleared");
  const revision = store.revision();
  store.clear("/projects/blink", id);
  store.clear("/projects/blink", "missing");
  assert.equal(store.revision(), revision);
  const recurrence = report(store);
  assert.equal(recurrence.id, id);
  assert.equal(recurrence.version, 3);
  assert.equal(recurrence.state, "active");
});

test("memory snapshots include recent observations without mutating the source records", () => {
  const { store, advance } = harness();
  const original = report(store);
  const snapshot = store.snapshot();
  assert.equal(snapshot.length, 1);
  advance();
  store.clear("/projects/blink", original.id);
  assert.equal(snapshot[0].state, "active");
  assert.equal(snapshot[0].version, 1);
  assert.equal(store.snapshot()[0].state, "cleared");
  snapshot[0].message = "Caller mutation";
  assert.notEqual(store.recent("/projects/blink")[0].message, snapshot[0].message);
});

test("memory snapshots stay bounded, expire lazily and retain project identity", () => {
  const { store, advance } = harness();
  for (let project = 0; project < 5; project++) {
    for (let error = 0; error < 9; error++) {
      report(store, { projectKey: `/projects/${project}`, projectPath: `/projects/${project}`, message: `Error ${error}` });
      advance();
    }
  }
  const snapshot = store.snapshot();
  assert.equal(snapshot.length, 24);
  assert.equal(new Set(snapshot.map(entry => entry.projectKey)).size, 4);
  assert.equal(snapshot[0].projectPath, "/projects/4");
  assert.ok(snapshot.every(entry => entry.boardId === "icebreaker"));
  advance(DIAGNOSTIC_LIMITS.ttlMs);
  assert.deepEqual(store.snapshot(), []);
});

test("troubleshoot intent stays scoped, is consumed once, and unsubscribes cleanly", () => {
  const { store } = harness();
  let notifications = 0;
  const unsubscribe = store.subscribeIntent(() => { notifications++; });
  const intent = { projectKey: "C:\\projects\\blink\\", diagnosticId: "diagnostic:1", prompt: "Help troubleshoot the programmer error" };
  store.troubleshoot(intent);
  assert.equal(notifications, 1);
  assert.equal(store.takeIntent("C:/projects/other"), undefined);
  assert.deepEqual(store.takeIntent("C:/projects/blink"), intent);
  assert.equal(store.takeIntent("C:/projects/blink"), undefined);
  unsubscribe();
  store.troubleshoot({ ...intent, diagnosticId: "diagnostic:2" });
  assert.equal(notifications, 1);
  assert.equal(store.takeIntent("C:/projects/blink/").diagnosticId, "diagnostic:2");
});
