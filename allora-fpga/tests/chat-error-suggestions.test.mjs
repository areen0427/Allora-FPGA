import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/ChatErrorSuggestions.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const ast = ts.createSourceFile("ChatErrorSuggestions.js", compiled, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const componentCode = ast.statements.filter(ts.isImportDeclaration).reduceRight((code, statement) => code.slice(0, statement.getFullStart()) + code.slice(statement.end), compiled)
  .replace("export default function", "function");

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" ? text(node.props?.children) : String(node ?? "");
}
function harness() {
  let state;
  const chosen = [];
  const useState = initial => {
    state ??= initial;
    return [state, update => { state = typeof update === "function" ? update(state) : update; }];
  };
  const jsx = (type, props) => ({ type, props });
  const Component = new Function("useState", "_jsx", "_jsxs", "CircleAlert", "X", "diagnosticSourceLabel", `${componentCode}\nreturn ChatErrorSuggestions;`)(useState, jsx, jsx, "CircleAlert", "X", () => "Programming");
  return {
    chosen,
    render: (entries, disabled = false) => Component({ entries, disabled, onChoose: (...args) => chosen.push(args) }),
  };
}
const diagnostic = (overrides = {}) => ({ id: "error-1", projectKey: "/project/a", version: 1, source: "programming", state: "active", ...overrides });

test("error suggestions prepare two basic requests for the latest active error without submitting", () => {
  const h = harness();
  const entry = diagnostic();
  const tree = h.render([diagnostic({ id: "cleared", state: "cleared" }), entry, diagnostic({ id: "older" })]);
  const buttons = nodes(tree).filter(node => node.type === "button");
  const troubleshoot = buttons.find(node => text(node) === "Troubleshoot the recent error");
  const explain = buttons.find(node => text(node) === "Explain what went wrong");
  assert.ok(troubleshoot && explain);
  assert.equal(h.chosen.length, 0);
  troubleshoot.props.onClick();
  explain.props.onClick();
  assert.deepEqual(h.chosen, [
    [entry, "Help me troubleshoot the recent Programming error in this project."],
    [entry, "Explain the recent Programming error in this project."],
  ]);
  assert.match(text(tree), /Programming · Recent error/);
});

test("dismissal follows a project's error version and never hides newer errors", () => {
  const h = harness();
  const entry = diagnostic();
  const dismiss = tree => nodes(tree).find(node => node.props?.["aria-label"] === "Dismiss error suggestions").props.onClick();
  dismiss(h.render([entry]));
  assert.equal(h.render([{ ...entry }]), null, "rerenders of the same error stay dismissed");
  assert.ok(h.render([{ ...entry, version: 2 }]), "a changed error is suggested again");
  assert.ok(h.render([{ ...entry, id: "error-2" }]), "a new error is suggested");
  const otherProject = { ...entry, projectKey: "/project/b" };
  dismiss(h.render([otherProject]));
  assert.equal(h.render([entry]), null, "dismissal is remembered when returning to a project");
  assert.equal(h.render([otherProject]), null);
  assert.equal(h.render([{ ...entry, state: "cleared" }]), null);
  assert.equal(h.render([]), null);
});

test("busy chat disables suggestions while dismissal remains available", () => {
  const h = harness();
  const buttons = nodes(h.render([diagnostic()], true)).filter(node => node.type === "button");
  assert.equal(buttons.find(node => text(node) === "Troubleshoot the recent error").props.disabled, true);
  assert.equal(buttons.find(node => text(node) === "Explain what went wrong").props.disabled, true);
  assert.equal(buttons.find(node => node.props["aria-label"] === "Dismiss error suggestions").props.disabled, undefined);
});
