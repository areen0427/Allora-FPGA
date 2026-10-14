import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/chatHistory.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { chatHistoryDetails } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const projects = [{ projectPath: "/projects/one", boardId: "icebreaker" }, { projectPath: "/projects/two", boardId: "alchitry-au" }];
const chat = { workspacePath: "/projects/one", messages: [], updatedAt: "2026-10-13T15:12:00Z" };
test("chat history uses the most recent project in message order", () => {
  const details = chatHistoryDetails({ ...chat, messages: [{ projectPath: "/projects/one" }, { projectPath: "/projects/two" }, {}] }, projects);
  assert.equal(details.boardId, "alchitry-au");
  assert.equal(details.hasProject, true);
  assert.equal(details.updatedDateTime, "2026-10-13T15:12:00.000Z");
  assert.notEqual(details.updatedLabel, "Date unavailable");
});
test("existing-project chats resolve their workspace board without a creation message", () => {
  assert.equal(chatHistoryDetails(chat, projects).boardId, "icebreaker");
  assert.equal(chatHistoryDetails({ ...chat, workspacePath: "\\projects\\two\\" }, projects).boardId, "alchitry-au");
});
test("missing latest projects never show an older project's board", () => {
  const details = chatHistoryDetails({ ...chat, messages: [{ projectPath: "/projects/one" }, { projectPath: "/projects/missing" }] }, projects);
  assert.equal(details.boardId, undefined);
  assert.equal(details.hasProject, true);
});
test("projectless chats and legacy missing dates remain explicit", () => {
  for (const updatedAt of [undefined, "invalid"]) {
    const details = chatHistoryDetails({ workspacePath: "/parent", messages: [], updatedAt }, projects);
    assert.equal(details.hasProject, false);
    assert.equal(details.updatedLabel, "Date unavailable");
    assert.equal(details.updatedDateTime, undefined);
  }
});
