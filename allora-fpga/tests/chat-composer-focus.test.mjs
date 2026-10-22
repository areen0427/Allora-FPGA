import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/pages/ChatPage.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("ChatPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let focusEffect;
function findEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect"
    && node.arguments[0]?.getText(ast).includes("const isInsideComposer")) focusEffect = node.arguments[0];
  ts.forEachChild(node, findEffect);
}
findEffect(ast);
assert.ok(focusEffect, "the actual composer interaction effect is exercised");
const compiled = ts.transpileModule(`const effect = ${focusEffect.getText(ast)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const createEffect = new Function("composerRef", "setComposerEngaged", "document", "window", `${compiled}\nreturn effect;`);

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatch(name, event = {}) { for (const listener of listeners.get(name) ?? []) listener(event); },
    count() { return [...listeners.values()].reduce((total, items) => total + items.size, 0); },
  };
}
function harness() {
  const inside = new Set();
  const composerRef = { current: { contains: target => inside.has(target) } };
  const document = Object.assign(eventTarget(), { body: {}, documentElement: {}, activeElement: null });
  document.activeElement = document.body;
  const frames = new Map();
  let nextFrame = 0, engaged = false;
  const window = Object.assign(eventTarget(), {
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const cleanup = createEffect(composerRef, value => { engaged = value; }, document, window)();
  return {
    document, window, inside, cleanup, engaged: () => engaged,
    frame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); },
    focus(target) { document.activeElement = target; document.dispatch("focusin", { target }); },
    pointer(target) { document.dispatch("pointerdown", { target }); },
  };
}

test("composer stays engaged through popup close/open and selection focus gaps", () => {
  const h = harness();
  const input = {};
  h.inside.add(input);
  assert.equal(h.engaged(), false);
  h.focus(input);
  assert.equal(h.engaged(), true);

  for (const label of ["mode", "language", "provider", "model", "reasoning", "usage"]) {
    const trigger = {}, option = {};
    h.inside.add(trigger); h.inside.add(option);
    // Pointerdown closes the old popup before click opens the next popup.
    h.pointer(trigger);
    h.focus(h.document.body);
    h.frame();
    assert.equal(h.engaged(), true, `${label}: keep the glow during the handoff`);
    h.focus(option);
    h.pointer(option);
    h.inside.delete(option);
    h.focus(h.document.body);
    h.frame();
    assert.equal(h.engaged(), true, `${label}: removing the selected option must not drop the glow`);
    h.focus(trigger);
  }
  h.cleanup();
});

test("outside pointer and focus dismiss the composer highlight", () => {
  const h = harness();
  const control = {}, outside = {};
  h.inside.add(control);
  h.pointer(control);
  h.pointer(outside);
  assert.equal(h.engaged(), false);
  h.focus(control);
  h.focus(outside);
  assert.equal(h.engaged(), false);
  h.focus(control);
  h.pointer(h.document.body);
  assert.equal(h.engaged(), false, "a real click on the page clears the highlight");
  h.cleanup();
});

test("Tab keeps the highlight inside and clears it when focus leaves, including browser chrome", () => {
  const h = harness();
  const input = {}, control = {}, outside = {};
  h.inside.add(input); h.inside.add(control);
  h.focus(input);
  h.document.dispatch("keydown", { key: "Tab" });
  h.document.activeElement = control;
  h.frame();
  assert.equal(h.engaged(), true);
  h.document.dispatch("keydown", { key: "Tab" });
  h.document.activeElement = outside;
  h.frame();
  assert.equal(h.engaged(), false);
  h.focus(control);
  h.document.dispatch("keydown", { key: "Tab", shiftKey: true });
  h.document.activeElement = h.document.body;
  h.frame();
  assert.equal(h.engaged(), false, "Tab to browser chrome must not leave the composer glowing");
  h.cleanup();
});

test("window blur and unmount release composer interaction tracking", () => {
  const h = harness();
  const control = {};
  h.inside.add(control);
  h.focus(control);
  h.window.dispatch("blur");
  assert.equal(h.engaged(), false);
  h.focus(control);
  h.document.dispatch("keydown", { key: "Tab" });
  h.cleanup();
  assert.equal(h.document.count() + h.window.count(), 0);
  h.document.activeElement = h.document.body;
  h.frame();
  assert.equal(h.engaged(), true, "unmount cancels a pending Tab frame");
});
