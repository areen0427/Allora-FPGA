import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/components/ChatTurnDetails.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const jsx = (type, props, key) => ({ type, props, key });
const exports = {};
new Function("require", "exports", compiled)(name => {
  if (name === "react") return { useMemo: callback => callback(), useState: initial => [initial, () => {}] };
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
  if (name.includes("chatResults")) return { formatTurnDuration: () => "1m 16s", extractChatArtifacts: () => [] };
  return {};
}, exports);
function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object") return [];
  return [node, ...descendants(node.props?.children)];
}

test("every model result tile is a single native button including its path and padding", () => {
  const artifacts = ["waveform", "synthesis", "timing", "bitstream", "file"].map(kind => ({ id: kind, kind, label: `${kind} result`, path: `/project/results/${kind}`, data: kind === "timing" ? { met: true } : undefined }));
  const opened = [];
  const tree = exports.default({ tools: [], artifacts, onOpenArtifact: artifact => opened.push(artifact) });
  const buttons = descendants(tree).filter(node => node.type === "button");
  assert.equal(buttons.length, artifacts.length);
  for (const [index, button] of buttons.entries()) {
    assert.match(button.props.className, /chat-result-card/);
    assert.equal(button.props["data-glass"], "off");
    assert.ok(descendants(button).some(node => node.type === "small" && node.props.title === artifacts[index].path));
    assert.ok(!descendants(button.props.children).some(node => node.type === "button" || node.type === "details"), "no nested buttons or expandable reports inside the hit target");
    button.props.onClick();
  }
  assert.deepEqual(opened, artifacts);
  const disabled = exports.default({ tools: [], artifacts, disabled: true, onOpenArtifact() {} });
  assert.ok(descendants(disabled).filter(node => node.type === "button").every(button => button.props.disabled));
});

test("View Project editor destination works for the current project and queues other projects", async () => {
  const source = await readFile(new URL("../src/pages/Dashboard.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("Dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "openChatArtifact") handler = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const code = ts.transpileModule(`${handler.getText(ast)}\nexports.open = openChatArtifact;`, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText;
  const sections = [], queued = [], projects = [], api = {};
  new Function("projectPath", "reloadChatFiles", "fileMgmt", "activeTabs", "setActiveSection", "queueChatArtifact", "onOpenChatProject", "setRequestedChatWaveform", "exports", code)(
    "/projects/current", async () => { throw new Error("Project viewing must preserve the loaded editor even when disk reads fail"); }, { files: [] }, { openFile() { throw new Error("No report file was selected"); } },
    section => sections.push(section), artifact => queued.push(artifact), async path => projects.push(path), () => {}, api,
  );
  const view = { id: "project", kind: "file", label: "View Project", projectPath: "/projects/current" };
  await api.open(view);
  assert.deepEqual(sections, ["editor"]);
  const other = { ...view, projectPath: "/projects/other" };
  await api.open(other);
  assert.deepEqual(projects, ["/projects/other"]);
  assert.deepEqual(queued, [other]);
});
