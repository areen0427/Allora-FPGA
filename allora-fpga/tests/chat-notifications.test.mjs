import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function compile(path, require = () => ({})) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function("require", "exports", "window", code)(require, exports, clock);
  return exports;
}
let timers = new Map(), sequence = 0;
const clock = { setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } };
const store = (await compile("../src/lib/chatNotifications.ts")).chatNotifications;
test("only off-screen completions notify; dismissal retains unread until chat is opened", () => {
  store.reset(); store.setVisible(true); store.complete();
  assert.deepEqual(store.snapshot(), { unread: false, toast: null });
  store.setVisible(false); store.complete();
  const id = store.snapshot().toast;
  assert.equal(store.snapshot().unread, true);
  store.dismiss(id); assert.deepEqual(store.snapshot(), { unread: true, toast: null });
  store.setVisible(true); assert.deepEqual(store.snapshot(), { unread: false, toast: null });
});
test("an old dismissal cannot hide a newer completion", () => {
  store.setVisible(false); store.complete(); const old = store.snapshot().toast;
  store.complete(); const current = store.snapshot().toast;
  store.dismiss(old); assert.equal(store.snapshot().toast, current);
  store.reset();
});
test("toast waits six seconds, animates dismissal, then disappears without clearing unread", async () => {
  timers = new Map(); const states = [], effects = []; let stateIndex = 0, effectIndex = 0, pending = [];
  const jsx = (type, props, key) => ({ type, props, key });
  const component = (await compile("../src/components/ChatCompletionNotification.tsx", name => {
    if (name === "react") return {
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
      useEffect(fn, deps) { const i = effectIndex++; if (!effects[i] || deps.some((dep, j) => dep !== effects[i].deps[j])) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
    };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name.includes("chatNotifications")) return { chatNotifications: store };
    return {};
  })).default;
  const render = () => { stateIndex = effectIndex = 0; pending = []; const tree = component(); pending.forEach(fn => fn()); return tree; };
  store.setVisible(false); store.complete();
  let tree = render(); assert.equal(tree.props.className, "chat-completion-popup");
  assert.equal(tree.props.children[1].props.unreadIndicator, false, "the icon inside the notification stays plain");
  const timeout = [...timers.values()].find(timer => timer.ms === 6000); assert.ok(timeout); timeout.fn();
  tree = render(); assert.match(tree.props.className, /is-leaving/);
  const exit = [...timers.values()].find(timer => timer.ms === 420); assert.ok(exit); exit.fn();
  assert.equal(render(), null); assert.equal(store.snapshot().unread, true);
  store.complete(); tree = render(); assert.doesNotMatch(tree.props.className, /is-leaving/);
  assert.ok(!tree.props.children.some(child => child?.type === "button"), "the popup has no close button");
  effects.forEach(effect => effect.cleanup?.()); store.reset();
});
