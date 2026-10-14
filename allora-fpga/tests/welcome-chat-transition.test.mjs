import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/pages/welcome/HomeView.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const imports = [...compiled.matchAll(/^import (.*?) from .*;$/gm)].flatMap(([, clause]) => clause.startsWith("{") ? clause.slice(1, -1).split(",").map(name => name.trim().split(/\s+as\s+/).at(-1)) : [clause]);
let serial = 0;
async function harness(reduceMotion = false) {
  const states = [];
  let index = 0, opened = 0;
  const jsx = (type, props) => ({ type, props });
  const bindings = Object.fromEntries(imports.filter(Boolean).map(name => [name, () => null]));
  Object.assign(bindings, {
    _jsx: jsx, _jsxs: jsx,
    useState(initial) {
      const slot = index++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], value => { states[slot] = value; }];
    },
    useEffect() {}, useLayoutEffect() {}, useRef: () => ({ current: null }),
    version: "test", alloraIcon: "icon",
  });
  globalThis.welcomeTransitionHarness = bindings;
  const prefix = `const { ${Object.keys(bindings).join(", ")} } = globalThis.welcomeTransitionHarness;\n`;
  const { HomeView } = await import(`data:text/javascript;base64,${Buffer.from(prefix + compiled.replace(/^import .*;\n/gm, "")).toString("base64")}#${serial++}`);
  delete globalThis.welcomeTransitionHarness;
  function find(node) {
    if (node?.type?.name === "ExecutionPathChooser") return node;
    return [node?.props?.children].flat().map(child => child && find(child)).find(Boolean);
  }
  return {
    get opened() { return opened; },
    render() {
      index = 0;
      const tree = HomeView({ path: null, boards: [], recentProjects: [], reduceMotion, onOpenChat() { opened++; } });
      return { tree, chooser: find(tree) };
    },
  };
}
test("AI Design Studio waits for the landing handoff and ignores child animations", async () => {
  const h = await harness();
  h.render().chooser.props.onOpenChat();
  assert.equal(h.opened, 0);
  const { tree, chooser } = h.render();
  assert.equal(chooser.props.selectedTarget, "chat");
  assert.match(tree.props.className, /is-transitioning transition-chat/);
  const stage = {};
  tree.props.onAnimationEnd({ target: {}, currentTarget: stage });
  assert.equal(h.opened, 0);
  tree.props.onAnimationEnd({ target: stage, currentTarget: stage });
  assert.equal(h.opened, 1);
});
test("Reduce Motion opens AI Design Studio immediately", async () => {
  const h = await harness(true);
  h.render().chooser.props.onOpenChat();
  assert.equal(h.opened, 1);
  assert.equal(h.render().chooser.props.selectedTarget, null);
});
