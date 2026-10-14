import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/pages/Dashboard.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("Dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const entrance = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "TroubleshootChatEntrance");
assert.ok(entrance);
const compiled = ts.transpileModule(`${entrance.getText(ast)}\nexport { TroubleshootChatEntrance };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/^import .*;\n/gm, "");
let serial = 0;

async function harness({ appReduced = false, systemReduced = false } = {}) {
  const refs = [], animations = [];
  let refIndex = 0, pendingEffect, cleanup, previousDeps;
  const surface = {
    animate(keyframes, options) {
      const animation = { keyframes, options, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    },
  };
  globalThis.troubleshootTransitionHarness = {
    _jsx: (type, props) => ({ type, props }),
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useEffect(effect, deps) {
      if (!previousDeps || deps.some((value, index) => value !== previousDeps[index])) pendingEffect = effect;
      previousDeps = deps;
    },
    document: { documentElement: { dataset: { reduceMotion: String(appReduced) } } },
    window: { matchMedia: () => ({ matches: systemReduced }) },
  };
  const prefix = "const { _jsx, useRef, useEffect, document, window } = globalThis.troubleshootTransitionHarness;\n";
  const { TroubleshootChatEntrance } = await import(`data:text/javascript;base64,${Buffer.from(prefix + compiled).toString("base64")}#${serial++}`);
  delete globalThis.troubleshootTransitionHarness;
  return {
    animations,
    render(active, request, children = "stable chat session") {
      refIndex = 0;
      const tree = TroubleshootChatEntrance({ active, request, children });
      tree.props.ref.current = surface;
      if (pendingEffect) {
        cleanup?.();
        cleanup = pendingEffect();
        pendingEffect = undefined;
      }
      return tree;
    },
  };
}

test("Troubleshoot animates the stable chat surface for every explicit request", async () => {
  const h = await harness();
  const session = { streaming: true, draft: "my question" };
  h.render(false, 0, session);
  const first = h.render(true, 1, session);
  assert.equal(first.props.children, session);
  assert.equal(h.animations.length, 1);
  assert.equal(h.animations[0].options.duration, 420);
  assert.deepEqual(h.animations[0].keyframes.at(-1), { opacity: 1, transform: "translateY(0) scale(1)" });
  const repeated = h.render(true, 2, session);
  assert.equal(repeated.props.children, session);
  assert.equal(h.animations.length, 2);
  assert.equal(h.animations[0].cancelled, true);
  h.render(false, 2, session);
  assert.equal(h.animations[1].cancelled, true);
  h.render(true, 2, session);
  assert.equal(h.animations.length, 2, "ordinary navigation must not replay an old request");
});

test("ordinary chat visits and either Reduce Motion preference skip Troubleshoot motion", async () => {
  const normal = await harness();
  normal.render(true, 0);
  assert.equal(normal.animations.length, 0);
  for (const preference of [{ appReduced: true }, { systemReduced: true }]) {
    const h = await harness(preference);
    assert.equal(h.render(true, 1).props.children, "stable chat session");
    h.render(true, 2);
    assert.equal(h.animations.length, 0);
  }
});

test("manual chat navigation stays available after saving fails", async () => {
  let callback;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === "onChat") callback = node.initializer.expression;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback);
  const code = ts.transpileModule(`export const navigate = ${callback.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const saveStatus of ["error", "dirty", "saved"]) {
    const sections = [], saves = [], exports = {};
    new Function("saveProject", "setActiveSection", "exports", code)({
      saveStatus,
      saveCurrentProject: async () => { saves.push(true); return false; },
    }, section => sections.push(section), exports);
    await exports.navigate();
    assert.deepEqual(sections, ["chat"], saveStatus);
    assert.equal(saves.length, saveStatus === "saved" ? 0 : 1);
  }
});
