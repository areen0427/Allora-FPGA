import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/ChatTurnDetails.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX } }).outputText;
let current;
const react = {
  useMemo: callback => callback(),
  useState(initial) {
    const owner = current, index = owner.index++;
    if (!(index in owner.states)) owner.states[index] = typeof initial === "function" ? initial() : initial;
    return [owner.states[index], value => { owner.states[index] = typeof value === "function" ? value(owner.states[index]) : value; }];
  },
  useEffect(effect, deps) {
    const owner = current, index = owner.index++;
    const previous = owner.deps[index];
    if (!previous || deps.some((value, offset) => value !== previous[offset])) {
      owner.cleanup[index]?.();
      owner.deps[index] = deps;
      owner.effects.push(() => { owner.cleanup[index] = effect(); });
    }
  },
};
const jsx = (type, props, key) => ({ type, props, key });
const exports = {};
new Function("require", "exports", code + "\nexports.TurnChangeReview = TurnChangeReview;")(name => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
  if (name.includes("chatResults")) return { formatTurnDuration: () => "1m 32s", extractChatArtifacts: () => [] };
  return {};
}, exports);
function runner(component, props) {
  const owner = { states: [], deps: [], cleanup: [], effects: [], index: 0 };
  return {
    render() {
      current = owner; owner.index = 0;
      const result = component(props);
      for (const effect of owner.effects.splice(0)) effect();
      return result;
    },
    unmount() { owner.cleanup.forEach(cleanup => cleanup?.()); },
  };
}
function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object") return [];
  return [node, ...descendants(node.props?.children)];
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const review = { id: "turn-1", projectPath: "/projects/example", files: [{ path: "src/top.sv", before: "old", after: "updated" }] };

test("turn summary owns lazy change reviews, including new-project reviews", () => {
  const props = { tools: [], files: ["src/top.sv"], reviewIds: ["turn-1", "created:new"], loadReview() { throw new Error("closed summaries must not load checkpoints"); }, onRestore: async () => {} };
  const h = runner(exports.default, props);
  let nodes = descendants(h.render());
  assert.ok(!nodes.some(node => node.type === exports.TurnChangeReview));
  const dropdown = nodes.find(node => node.type === "details" && node.props.className.includes("chat-turn-summary"));
  dropdown.props.onToggle({ currentTarget: { open: true } });
  nodes = descendants(h.render());
  const reviews = nodes.filter(node => node.type === exports.TurnChangeReview);
  assert.deepEqual(reviews.map(node => node.props.id), ["turn-1", "created:new"]);
  const body = descendants(h.render()).find(node => node.type === "details" && node.props.className.includes("chat-turn-summary"));
  assert.equal(descendants(body).filter(node => node.type === exports.TurnChangeReview).length, 2);
  dropdown.props.onToggle({ currentTarget: { open: false } });
  assert.ok(!descendants(h.render()).some(node => node.type === exports.TurnChangeReview));
});

test("inline reviews load the right checkpoint, restore it, and keep the diff visible", async () => {
  const loads = [], restores = [];
  const h = runner(exports.TurnChangeReview, { id: "turn-1", disabled: false,
    loadReview: async id => { loads.push(id); return review; },
    onRestore: async (...args) => { restores.push(args); } });
  assert.equal(h.render().props.role, "status");
  await tick();
  let content = h.render();
  assert.equal(content.type, exports.ChangeReview);
  assert.deepEqual(loads, ["turn-1"]);
  content.props.onRestore();
  await tick();
  content = h.render();
  assert.deepEqual(restores, [["turn-1", "/projects/example"]]);
  assert.equal(content.props.review.canRestore, false);
  assert.deepEqual(content.props.review.files, review.files);
});

test("expired checkpoints report inline, retry on request, and ignore late loads after closing", async () => {
  let attempts = 0;
  const h = runner(exports.TurnChangeReview, { id: "turn-1", disabled: false, onRestore: async () => {},
    loadReview: async () => { if (++attempts === 1) throw new Error("Checkpoint expired"); return review; } });
  h.render(); await tick();
  let status = h.render();
  assert.equal(status.props.role, "status");
  assert.ok(descendants(status).some(node => node.type === "span" && node.props.children === "Checkpoint expired"));
  descendants(status).find(node => node.type === "button").props.onClick();
  h.render(); await tick();
  assert.equal(h.render().props.review, review);
  let resolve;
  const late = runner(exports.TurnChangeReview, { id: "turn-1", disabled: false, onRestore: async () => {}, loadReview: () => new Promise(done => { resolve = done; }) });
  late.render(); late.unmount(); resolve(review); await tick();
  assert.equal(late.render().props.role, "status", "closed reviews do not receive late checkpoint data");
});
