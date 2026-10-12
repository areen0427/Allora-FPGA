import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const trackerSource = compile(await readFile(new URL("../src/lib/backSwipe.ts", import.meta.url), "utf8"));
const { createBackSwipeTracker } = await import(`data:text/javascript;base64,${Buffer.from(trackerSource).toString("base64")}`);
const hookSource = compile(await readFile(new URL("../src/hooks/useBackSwipe.ts", import.meta.url), "utf8")).replace(/^import .*;\n/gm, "");

test("one swipe goes from landing to chat; its momentum does not go on to Welcome", async () => {
  const listeners = new Set();
  let cleanups = [];
  globalThis.backSwipeNavigationHarness = {
    createBackSwipeTracker,
    createBackSwipeMotion: () => ({ progress() {}, navigate(back) { back(); return Promise.resolve(); } }),
    useRef: value => ({ current: value }),
    useEffect(effect) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    navigator: { platform: "MacIntel" },
    document: { querySelector: () => null },
    Element: class Element {},
    window: {
      addEventListener(type, callback) { listeners.add(callback); },
      removeEventListener(type, callback) { listeners.delete(callback); },
    },
  };
  const prefix = "const { createBackSwipeMotion, createBackSwipeTracker, useRef, useEffect, navigator, document, Element, window } = globalThis.backSwipeNavigationHarness;\n";
  const { useBackSwipe } = await import(`data:text/javascript;base64,${Buffer.from(prefix + hookSource).toString("base64")}`);
  delete globalThis.backSwipeNavigationHarness;
  let page = "landing";
  const mountChatDock = () => useBackSwipe(() => { page = "welcome"; });
  useBackSwipe(() => {
    page = "chat";
    const previous = cleanups;
    cleanups = [];
    previous.forEach(cleanup => cleanup());
    mountChatDock();
  });
  function wheel(time, deltaX) {
    // A dispatched event uses the current listener snapshot; navigation changes the next one.
    for (const callback of [...listeners]) callback({
      target: null, deltaMode: 0, deltaX, deltaY: 0, timeStamp: time,
      defaultPrevented: false, ctrlKey: false, preventDefault() {},
    });
  }
  wheel(0, -60);
  assert.equal(page, "landing");
  wheel(20, -60);
  assert.equal(page, "chat");
  wheel(40, -140);
  wheel(70, -110);
  assert.equal(page, "chat");
  wheel(700, -120);
  assert.equal(page, "welcome");
  cleanups.forEach(cleanup => cleanup());
  assert.equal(listeners.size, 0);
});
