import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
const jsx = (type, props, key) => ({ type, props, key });
function load(relativePath) {
  const file = resolve(import.meta.dirname, relativePath);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function("require", "exports", code)(name => {
    if (name.endsWith(".css")) return {};
    if (name === "react") return { useMemo: callback => callback(), useState: initial => [initial, () => {}] };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "@tauri-apps/plugin-opener") return { openUrl: async () => {} };
    if (!name.startsWith(".")) return require(name);
    const base = resolve(dirname(file), name);
    return load([base, `${base}.ts`, `${base}.tsx`].find(existsSync));
  }, exports);
  return exports;
}
const { parseChatSourceReference: reference, findChatSourceFile: findFile, safeChatDocumentationUrl: docUrl } = load("../src/lib/chatSourceReferences.ts");
const { parseChatInline, parseChatMarkdown, splitChatTableRow } = load("../src/lib/chatMarkdown.ts");
const { highlightChatHdl, chatHdlLanguage } = load("../src/lib/chatHdlHighlight.ts");
const { default: ChatMarkdown } = load("../src/components/ChatMarkdown.tsx");
const project = "/work/fpga project";

function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function") return descendants(node.type(node.props));
  return [node, ...descendants(node.props?.children)];
}

test("source references preserve exact project-relative paths, columns, ranges, spaces and Windows drives", () => {
  assert.deepEqual(reference("src/uart_rx.sv:86:7", project), { path: `${project}/src/uart_rx.sv`, relativePath: "src/uart_rx.sv", line: 86, column: 7 });
  assert.deepEqual(reference(`${project}/src/uart_rx.sv#L86-L92`, project), { path: `${project}/src/uart_rx.sv`, relativePath: "src/uart_rx.sv", line: 86, endLine: 92 });
  assert.equal(reference("src/HDL%20source.vhd#L4C3", project).relativePath, "src/HDL source.vhd");
  assert.equal(reference("./src/../src/top.v", project).line, 1);
  assert.equal(reference("C:\\design\\src\\top.v:4", "C:\\design").path, "c:/design/src/top.v");
  assert.equal(reference("src\\top.v:4", "C:\\design").relativePath, "src/top.v");
  assert.equal(reference("src/top.v:1", "/").path, "/src/top.v");
});

test("source references reject out-of-project paths, unsafe schemes, malformed locations and encoded controls", () => {
  for (const path of ["../secrets.json:1", "%2e%2e/secrets.json:1", "/work/fpga project-other/src/top.v:1", "/another/src/top.v:1", "https://example.com/foo.v:1", "file:///work/fpga%20project/src/top.v", "javascript:alert(1)", "data:text/plain,foo.v", "//server/project/top.v", "\\\\server\\top.v", "src/top.v:0", "src/top.v:-1", "src/top.v:9007199254740992", "src/top.v#L4-L2", "src/top%00.v", "src/top%0a.v", "src/top.v?x=1", "%zz.v"]) {
    assert.equal(reference(path, project), undefined, path);
  }
  assert.equal(reference("src/top.v:1"), undefined, "there is no current-project fallback for an unscoped old reply");
  assert.equal(reference("counter:12", project), undefined, "HDL symbols are not files");
});

test("file lookup never guesses an ambiguous basename or suffix and excludes binary files", () => {
  const target = reference("src/rtl/top.v:3", project);
  const files = [
    { name: "top.v", path: `${project}/sim/top.v`, content: "other" },
    { name: "rtl/top.v", path: `${project}/src/rtl/top.v`, content: "unsaved edits" },
  ];
  assert.equal(findFile(files, target, project), files[1]);
  assert.equal(findFile(files, reference("top.v:1", project), project), undefined);
  assert.equal(findFile([{ ...files[1], isBinary: true }], target, project), undefined);
  assert.equal(findFile([files[1], { ...files[1] }], target, project), undefined);
});

test("documentation links allow only credential-free HTTP and HTTPS", () => {
  assert.equal(docUrl("https://example.com/docs?q=rtl#top"), "https://example.com/docs?q=rtl#top");
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "https://user:password@example.com", "https://example.com/\nfoo", "https://example.com/ foo", "//example.com", "https:"]) assert.equal(docUrl(url), undefined, url);
});

test("Markdown supports documentation links, source references and formatting without parsing HDL underscores", () => {
  const items = parseChatInline("See [**docs**](https://example.com/doc_(one)) and `src/top.sv:6:2`, or src/top.sv:8. Keep data_valid unchanged; *emphasis*.");
  assert.equal(items.find(item => item.kind === "link").destination, "https://example.com/doc_(one)");
  assert.equal(items.find(item => item.kind === "link").children[0].kind, "strong");
  assert.ok(items.some(item => item.kind === "source" && item.text === "src/top.sv:8"));
  assert.ok(items.some(item => item.kind === "code" && item.text === "src/top.sv:6:2"));
  assert.ok(items.some(item => item.kind === "text" && item.text.includes("data_valid")));
  assert.equal(parseChatInline("(https://example.com/doc_(one)).")[1].destination, "https://example.com/doc_(one)");
  assert.equal(parseChatInline("<https://example.com/docs>")[0].destination, "https://example.com/docs");
});

test("tables preserve escaped and inline-code pipes, alignment and empty cells", () => {
  assert.deepEqual(splitChatTableRow("| A \\| B | `a | b` |"), ["A \\| B", "`a | b`"]);
  const [table] = parseChatMarkdown("| Signal | Value |\n| :--- | ---: |\n| `a | b` | **3** |\n| reset | |");
  assert.equal(table.kind, "table");
  assert.deepEqual(table.alignment, ["left", "right"]);
  assert.equal(table.rows[0][0][0].text, "a | b");
  assert.equal(table.rows[1][1].length, 0);
});

test("fenced HDL stays literal and streaming fences, headings, quotes and ordered-list starts render", () => {
  const blocks = parseChatMarkdown("## Response\n\n3. first\n4. second\n\n> quoted\n\n```systemverilog\nmodule top; // [link](javascript:bad)\nendmodule");
  assert.deepEqual(blocks.map(block => block.kind), ["heading", "list", "quote", "code"]);
  assert.equal(blocks[1].start, 3);
  assert.equal(blocks[3].language, "systemverilog");
  assert.equal(blocks[3].code, "module top; // [link](javascript:bad)\nendmodule");
});

test("all three HDL modes highlight tokens while preserving every source character", () => {
  for (const language of ["Verilog", "SystemVerilog", "system-verilog", "sv"]) {
    assert.equal(chatHdlLanguage(language), "verilog");
    const code = 'module top; logic [7:0] value = 8\'hA5; // module <script>\ninitial $display("module"); /* logic */ endmodule';
    const tokens = highlightChatHdl(code, language);
    assert.equal(tokens.map(token => token.text).join(""), code);
    assert.ok(tokens.some(token => token.kind === "keyword" && token.text === "logic"));
    assert.ok(tokens.some(token => token.kind === "comment" && token.text.includes("<script>")));
    assert.ok(tokens.some(token => token.kind === "string" && token.text === '"module"'));
    assert.ok(tokens.some(token => token.kind === "number" && token.text === "8'hA5"));
  }
  const vhdl = "ENTITY top IS -- entity\nPORT(clk: IN std_logic); END entity;";
  const tokens = highlightChatHdl(vhdl, "VHDL");
  assert.equal(tokens.map(token => token.text).join(""), vhdl);
  assert.ok(tokens.some(token => token.kind === "keyword" && token.text === "ENTITY"));
  assert.deepEqual(highlightChatHdl("<b>plain</b>", "unknown"), [{ text: "<b>plain</b>" }]);
});

test("rendered Markdown uses safe external anchors, no embedded HTML/images and scoped source buttons", async () => {
  const opened = [];
  const tree = ChatMarkdown({ projectPath: project, onOpenSource: artifact => opened.push(artifact), text:
    '[docs](https://example.com) [unsafe](javascript:alert(1)) <script>alert(1)</script> ![image](https://example.com/a.png)\n\n`src/top.sv:6:2` [source](src/top.sv#L7-L9) src/top.sv:10\n\n| A | B |\n| --- | --- |\n| value | **yes** |\n\n```vhdl\nENTITY top IS\n```',
  });
  const nodes = descendants(tree);
  const anchors = nodes.filter(node => node.type === "a");
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].props.href, "https://example.com/");
  assert.equal(anchors[0].props.rel, "noopener noreferrer");
  assert.ok(!nodes.some(node => ["img", "script", "iframe"].includes(node.type) || node.props?.dangerouslySetInnerHTML));
  assert.equal(nodes.filter(node => node.type === "table").length, 1);
  assert.ok(nodes.some(node => node.props?.className === "chat-hdl-keyword"));
  const sources = nodes.filter(node => node.type === "button" && node.props.className === "chat-source-reference");
  assert.equal(sources.length, 3);
  sources[0].props.onClick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(opened[0].projectPath, project);
  assert.equal(opened[0].path, `${project}/src/top.sv`);
  assert.deepEqual(opened[0].sourceLocation, { line: 6, column: 2 });
  assert.equal(descendants(ChatMarkdown({ text: "`src/top.sv:2`", onOpenSource() {} })).filter(node => node.type === "button").length, 0);
});

test("a source reference in a link label never creates nested interactive controls", () => {
  const nodes = descendants(ChatMarkdown({ projectPath: project, onOpenSource() {}, text: "[`src/top.v:2`](https://example.com)" }));
  assert.equal(nodes.filter(node => node.type === "a").length, 1);
  assert.equal(nodes.filter(node => node.type === "button").length, 0);
});

function extractFunction(relativePath, name) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const ast = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, visit); }
  visit(ast);
  assert.ok(found, name);
  return ts.transpileModule(`${found.getText(ast)}\nexports.handler = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText;
}

test("source navigation keeps dirty buffers, queues cross-project references and never guesses missing files", async () => {
  const file = { name: "rtl/top.v", path: `${project}/src/rtl/top.v`, content: "unsaved buffer" };
  const sections = [], navigation = [], opened = [], queued = [], projects = [], api = {};
  new Function("projectPath", "reloadChatFiles", "fileMgmt", "activeTabs", "setActiveSection", "queueChatArtifact", "onOpenChatProject", "setRequestedChatWaveform", "setEditorNavigation", "findChatSourceFile", "parseChatSourceReference", "exports", extractFunction("../src/pages/Dashboard.tsx", "openChatArtifact"))(
    project, async () => { throw new Error("source navigation must not reload disk over dirty buffers"); }, { files: [file] }, { openFile: name => opened.push(name) },
    section => sections.push(section), artifact => queued.push(artifact), async path => projects.push(path), () => {}, callback => navigation.push(callback(null)), findFile, reference, api,
  );
  const artifact = { id: "source", kind: "file", path: file.path, projectPath: project, sourceLocation: { line: 12, column: 4 } };
  await api.handler(artifact);
  assert.deepEqual(opened, [file.name]);
  assert.equal(navigation[0].line, 12);
  assert.equal(navigation[0].column, 4);
  assert.deepEqual(sections, ["editor"]);
  assert.equal(file.content, "unsaved buffer");
  await assert.rejects(api.handler({ ...artifact, path: `${project}/sim/top.v` }), /no longer available/);
  await api.handler({ ...artifact, projectPath: "/other/project" });
  assert.deepEqual(projects, ["/other/project"]);
  assert.equal(queued[0].sourceLocation.column, 4);
});

test("editor source navigation clamps stale line/column positions and retains source ranges", () => {
  const api = {}, calls = [];
  new Function("exports", extractFunction("../src/pages/dashboard/EditorSection.tsx", "revealNavigation"))(api);
  const editor = {
    getModel: () => ({ getLineCount: () => 10, getLineMaxColumn: () => 20 }),
    revealLineInCenter: line => calls.push(["reveal", line]), setPosition: position => calls.push(["position", position]),
    setSelection: selection => calls.push(["selection", selection]), focus: () => {},
  };
  api.handler(editor, { line: 99, column: 88 });
  assert.deepEqual(calls[1], ["position", { lineNumber: 10, column: 20 }]);
  api.handler(editor, { line: 2, column: 3, endLine: 30 });
  assert.deepEqual(calls[3], ["selection", { startLineNumber: 2, startColumn: 3, endLineNumber: 10, endColumn: 20 }]);
});
