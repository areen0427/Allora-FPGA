import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/components/ChatSession.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText.replace(/^import .*;\n/gm, "");
let id = 0;
async function harness() {
  const states = [], refs = [];
  const queuedArtifacts = [];
  const visibility = [];
  let stateIndex = 0, refIndex = 0;
  const container = { style: {}, parentNode: null, get isConnected() { return this.parentNode !== null; }, remove() { this.parentNode = null; } };
  const jsx = (type, props, key) => ({ type, props, key });
  globalThis.chatSessionHarness = {
    _jsx: jsx, _jsxs: jsx, ChatPage: "ChatPage", ChatCompletionNotification: "ChatCompletionNotification",
    chatNotifications: { setVisible(value) { visibility.push(value); }, reset() {} },
    createContext: () => ({ Provider: "Provider" }),
    createPortal: (child, target) => ({ child, target }),
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    document: { createElement: () => container },
    queueChatArtifact: artifact => queuedArtifacts.push(artifact),
  };
  const prefix = "const { _jsx, _jsxs, ChatPage, createContext, createPortal, useRef, useState, document, queueChatArtifact, chatNotifications, ChatCompletionNotification } = globalThis.chatSessionHarness;\n";
  const { ChatSessionProvider } = await import(`data:text/javascript;base64,${Buffer.from(prefix + compiled).toString("base64")}#${id++}`);
  delete globalThis.chatSessionHarness;
  return {
    container,
    queuedArtifacts,
    visibility,
    render() {
      stateIndex = refIndex = 0;
      const tree = ChatSessionProvider({ children: null });
      return { api: tree.props.value, chat: tree.props.children.find(child => child?.child)?.child };
    },
    host() { return { appendChild(child) { child.parentNode = this; } }; },
  };
}
const options = path => ({ initialProjectPath: path, onOpenProject: async () => {}, onOpenSettings() {} });

test("landing and setup visits keep the same chat instance and stable portal target", async () => {
  const h = await harness();
  const first = h.host(), second = h.host();
  const { api } = h.render();
  api.attach(first, options());
  const chat = h.render().chat;
  api.detach(first);
  assert.equal(h.container.parentNode, null);
  assert.equal(h.render().chat.key, chat.key);
  api.attach(second, options());
  assert.equal(h.render().chat.key, chat.key);
  assert.equal(h.container.parentNode, second);
});

test("result cards queue the exact artifact when opening its project from welcome", async () => {
  const h = await harness();
  const { api } = h.render();
  let opened;
  api.attach(h.host(), { ...options(), onOpenProject: async path => { opened = path; } });
  const artifact = { id: "wave", kind: "waveform", path: "/projects/new/sim/counter.vcd", projectPath: "/projects/new" };
  await h.render().chat.props.onOpenArtifact(artifact);
  assert.equal(opened, "/projects/new");
  assert.deepEqual(h.queuedArtifacts, [artifact]);
  let navigated;
  api.update({ ...options("/projects/new"), onOpenArtifact: item => { navigated = item; } });
  await h.render().chat.props.onOpenArtifact(artifact);
  assert.equal(navigated, artifact);
  assert.equal(h.queuedArtifacts.length, 1);
});
test("AI-created project retains its conversation; switching projects starts a scoped chat", async () => {
  const h = await harness();
  const { api } = h.render();
  let created;
  api.attach(h.host(), { ...options(), onProjectCreated: async path => { created = path; } });
  const chat = h.render().chat;
  await chat.props.onProjectCreated("/projects/new");
  assert.equal(created, "/projects/new");
  api.attach(h.host(), options("/projects/new"));
  assert.equal(h.render().chat.key, chat.key);
  api.attach(h.host(), { ...options("/projects/other"), resumeLatest: true });
  const other = h.render().chat;
  assert.notEqual(other.key, chat.key);
  assert.equal(other.props.initialProjectPath, "/projects/other");
  assert.equal(other.props.resumeLatest, true);
});
test("explicit session reset clears the conversation and next welcome launch is projectless", async () => {
  const h = await harness();
  const { api } = h.render();
  api.attach(h.host(), options("/projects/current"));
  api.reset();
  assert.equal(h.render().chat, undefined);
  api.attach(h.host(), options());
  assert.equal(h.render().chat.props.initialProjectPath, undefined);
  assert.equal(h.render().chat.props.resumeLatest, false);
});

test("project entry resumes saved history even on the first chat after launch", async () => {
  for (let launch = 0; launch < 2; launch++) {
    const h = await harness();
    const { api } = h.render();
    api.attach(h.host(), { ...options("/projects/saved"), resumeLatest: true });
    assert.equal(h.render().chat.props.resumeLatest, true);
  }
});
test("in-app return preserves the active chat and later project visits can resume history", async () => {
  const h = await harness();
  const { api } = h.render();
  const first = h.host();
  api.attach(first, { ...options(), resumeLatest: true });
  const chat = h.render().chat;
  api.detach(first);
  api.attach(h.host(), { ...options(), resumeLatest: true });
  assert.equal(h.render().chat.key, chat.key);
  api.attach(h.host(), { ...options("/projects/saved"), resumeLatest: true });
  assert.equal(h.render().chat.props.resumeLatest, true);
});


test("notification visibility follows hidden chat hosts, returns and detach", async () => {
  const h = await harness(); const host = h.host(); const { api } = h.render();
  api.attach(host, { ...options(), hidden: true }); assert.equal(h.visibility.at(-1), false);
  api.update({ ...options(), hidden: false }); assert.equal(h.visibility.at(-1), true);
  api.update({ ...options(), hidden: true }); assert.equal(h.visibility.at(-1), false);
  api.detach(host); assert.equal(h.visibility.at(-1), false);
  api.update(options()); assert.equal(h.visibility.at(-1), false);
});

test("recent chat project activation populates the workspace without remounting its conversation", async () => {
  const h = await harness(); const { api } = h.render(); const host = h.host(); const opened = [];
  api.attach(host, { ...options(), onOpenProject: async path => { opened.push(path); api.detach(host); api.attach(h.host(), options(path)); } });
  const before = h.render().chat;
  await before.props.onActivateProject("/projects/latest");
  assert.deepEqual(opened, ["/projects/latest"]);
  assert.equal(h.render().chat.key, before.key, "the chosen conversation survives the welcome-to-workspace handoff");
  await h.render().chat.props.onActivateProject("/projects/latest");
  assert.equal(opened.length, 1, "current project's editor state is not reloaded");
});

test("language settings update the live conversation without remounting and use the current host callback", async () => {
  const h = await harness();
  const { api } = h.render();
  const changed = [];
  api.attach(h.host(), {
    ...options(), language: "verilog", onLanguageChange: language => changed.push(["first", language]),
  });
  const initial = h.render().chat;
  assert.equal(initial.props.language, "verilog");
  api.update({
    ...options(), language: "vhdl", onLanguageChange: language => changed.push(["latest", language]),
  });
  const updated = h.render().chat;
  assert.equal(updated.key, initial.key, "language changes must preserve the conversation and draft");
  assert.equal(updated.props.language, "vhdl");
  initial.props.onLanguageChange("systemverilog");
  assert.deepEqual(changed, [["latest", "systemverilog"]]);
});

test("standalone chat hosts retain ChatPage's local language fallback", async () => {
  const h = await harness();
  const { api } = h.render();
  api.attach(h.host(), options());
  assert.equal(h.render().chat.props.onLanguageChange, undefined);
  api.update({ ...options(), onLanguageChange() {} });
  assert.equal(typeof h.render().chat.props.onLanguageChange, "function");
  api.update(options());
  assert.equal(h.render().chat.props.onLanguageChange, undefined);
});

test("starting a projectless chat detaches the old workspace without remounting the conversation", async () => {
  const h = await harness();
  const { api } = h.render();
  const projectHost = h.host();
  const welcomeHost = h.host();
  let departures = 0;
  api.attach(projectHost, {
    ...options("/projects/old"),
    onProjectlessConversationSelected: async () => {
      departures++;
      api.detach(projectHost);
      api.attach(welcomeHost, options());
      return true;
    },
  });
  const before = h.render().chat;
  assert.equal(await before.props.onProjectlessConversationSelected(), true);
  const after = h.render().chat;
  assert.equal(departures, 1);
  assert.equal(h.container.parentNode, welcomeHost);
  assert.equal(after.key, before.key);
  assert.equal(after.props.initialProjectPath, undefined);
  assert.equal(after.props.diagnosticsProjectKey, undefined);
  assert.equal(after.props.resumeLatest, false);
});

test("saved default folder updates reach a mounted chat and survive a host handoff", async () => {
  const h = await harness();
  const { api } = h.render();
  const host = h.host();
  api.attach(host, { ...options(), defaultProjectDirectory: "/saved/first" });
  const before = h.render().chat;
  api.update({ ...options(), defaultProjectDirectory: "/saved/latest" });
  assert.equal(h.render().chat.props.defaultProjectDirectory, "/saved/latest");
  assert.equal(h.render().chat.key, before.key);
  api.detach(host);
  api.attach(h.host(), { ...options(), defaultProjectDirectory: "/saved/latest" });
  assert.equal(h.render().chat.props.defaultProjectDirectory, "/saved/latest");
  assert.equal(h.render().chat.key, before.key);
});
