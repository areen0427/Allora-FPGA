import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the component's event handlers without a browser or visual capture.
const source = (await readFile(new URL("../src/components/ChatModelControls.tsx", import.meta.url), "utf8"))
  .replace(/import .* from "react";/, "const { useEffect, useId, useLayoutEffect, useRef, useState, React } = globalThis.chatControlHarness;")
  .replace(/import .* from "lucide-react";/, 'const Check = "check", ChevronDown = "chevron", Sparkles = "sparkles";');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

test("reasoning drag stays open, moves continuously and commits the nearest level on release", async () => {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0;
  globalThis.chatControlHarness = {
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
    },
    useRef(initial) {
      const i = refIndex++;
      return refs[i] ??= { current: initial };
    },
    useId: () => "test-model-popup",
    useEffect: () => {},
    useLayoutEffect: () => {},
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
  };
  try {
    const { default: Controls } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
    const committed = [];
    const props = {
      models: [{ model: "test-model", displayName: "Test model", isDefault: true,
        supportedReasoningEfforts: ["low", "medium", "high"].map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })) }],
      selectedModel: "test-model", reasoningEffort: "medium", disabled: false,
      loading: false, error: "", onModelChange() {},
      onReasoningChange(effort) { committed.push(effort); props.reasoningEffort = effort; },
    };
    const render = () => { stateIndex = 0; refIndex = 0; return Controls(props); };
    let tree = render();
    assert.equal(tree.props.onBlur, undefined, "focus loss must not dismiss the popup");
    assert.equal(find(tree, node => node.type === "input"), undefined, "no model search or visible slider initially");
    const button = find(tree, node => node.props["aria-controls"] === "test-model-popup-reasoning");
    assert.equal(find(button, node => node.type === "span").children[0], "Medium");
    button.props.onClick();
    tree = render();
    let slider = find(tree, node => node.props.role === "slider");
    assert.equal(slider.props["aria-valuenow"], 1);
    const pointerTarget = {
      getBoundingClientRect: () => ({ left: 0, width: 218 }), focus() {},
      setPointerCapture(id) { assert.equal(id, 1); }, releasePointerCapture() {},
    };
    slider.props.onPointerDown({ pointerId: 1, clientX: 109, currentTarget: pointerTarget, preventDefault() {} });
    slider.props.onPointerMove({ clientX: 182, currentTarget: pointerTarget });
    tree = render();
    slider = find(tree, node => node.props.role === "slider");
    assert.equal(slider.props["aria-valuenow"], 1.73);
    assert.deepEqual(committed, [], "persist only when released");
    slider.props.onPointerUp({ pointerId: 1, clientX: 182, currentTarget: pointerTarget });
    tree = render();
    slider = find(tree, node => node.props.role === "slider");
    assert.ok(slider, "release leaves the popup open");
    assert.equal(slider.props["aria-valuenow"], 2);
    assert.deepEqual(committed, ["high"]);
    slider.props.onKeyDown({ key: "ArrowLeft", preventDefault() {} });
    assert.equal(props.reasoningEffort, "medium", "keyboard steps remain discrete");
  } finally {
    delete globalThis.chatControlHarness;
  }
});
