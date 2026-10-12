import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/components/ChatSession.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText.replace(/^import .*;\n/gm, "");
let id = 0;
async function harness() {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0;
  const container = { style: {}, parentNode: null, remove() { this.parentNode = null; } };
  const jsx = (type, props, key) => ({ type, props, key });
  globalThis.chatSessionHarness = {
    _jsx: jsx, _jsxs: jsx, ChatPage: "ChatPage",
    createContext: () => ({ Provider: "Provider" }),
    createPortal: (child, target) => ({ child, target }),
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    document: { createElement: () => container },
  };
  const prefix = "const { _jsx, _jsxs, ChatPage, createContext, createPortal, useRef, useState, document } = globalThis.chatSessionHarness;\n";
  const { ChatSessionProvider } = await import(`data:text/javascript;base64,${Buffer.from(prefix + compiled).toString("base64")}#${id++}`);
  delete globalThis.chatSessionHarness;
  return {
    container,
    render() {
      stateIndex = refIndex = 0;
      const tree = ChatSessionProvider({ children: null });
      return { api: tree.props.value, chat: tree.props.children[1]?.child };
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
test("Home clears the live conversation and next welcome launch is projectless", async () => {
  const h = await harness();
  const { api } = h.render();
  api.attach(h.host(), options("/projects/current"));
  api.reset();
  assert.equal(h.render().chat, undefined);
  api.attach(h.host(), options());
  assert.equal(h.render().chat.props.initialProjectPath, undefined);
  assert.equal(h.render().chat.props.resumeLatest, undefined);
});
