import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/backSwipe.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createBackSwipeTracker } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("back swipe accumulates and fires once, ignoring momentum until a new gesture", () => {
  const track = createBackSwipeTracker();
  assert.equal(track(-50, 0, 0, true), false);
  assert.equal(track(-50, 0, 20, true), true);
  assert.equal(track(-120, 0, 40, true), false);
  assert.equal(track(-120, 0, 600, true), true);
});
test("vertical scroll, forward swipe and small movement do not navigate", () => {
  const track = createBackSwipeTracker();
  assert.equal(track(150, 0, 0, true), false);
  assert.equal(track(-150, 120, 20, true), false);
  assert.equal(track(-10, 0, 40, true), false);
});
test("a gesture owned by a scroller or dialog remains blocked through its tail", () => {
  const track = createBackSwipeTracker();
  assert.equal(track(-120, 0, 0, false), false);
  assert.equal(track(-120, 0, 20, true), false);
  assert.equal(track(-120, 0, 600, true), true);
});

test("zero-delta trackpad events do not reset an in-progress nudge", () => {
  const progress = [];
  const track = createBackSwipeTracker(value => progress.push(value));
  assert.equal(track(-50, 0, 0, true), false);
  assert.equal(track(0, 0, 20, true), false);
  assert.deepEqual(progress, [0.5]);
  assert.equal(track(-50, 0, 40, true), true);
  assert.deepEqual(progress, [0.5, 1]);
});

test("slow swipes tolerate diagonal noise and pauses without resetting the nudge", () => {
  const progress = [];
  const track = createBackSwipeTracker(value => progress.push(value));
  assert.equal(track(-20, 0, 0, true), false);
  assert.equal(track(-1, 2, 50, true), false);
  assert.equal(track(-20, 0, 350, true), false);
  assert.equal(track(-60, 0, 650, true), true);
  assert.deepEqual(progress, [0.2, 0.4, 1]);
});
