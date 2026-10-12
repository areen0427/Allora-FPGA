import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/backSwipeMotion.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
let id = 0;
async function harness({ appReduced = false, systemReduced = false } = {}) {
  const animations = [], timers = [], frames = new Map(), indicators = [];
  const classes = new Set();
  const surface = {
    style: { translate: "", removeProperty() { this.translate = ""; } },
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    animate(keyframes, options) {
      const animation = { keyframes, options, cancel() {} };
      animations.push(animation);
      return animation;
    },
  };
  let frameId = 0, time = 0;
  globalThis.backSwipeMotionHarness = {
    document: {
      documentElement: { dataset: { reduceMotion: String(appReduced) } }, getElementById: () => surface,
      createElement: () => ({ style: { setProperty(name, value) { this[name] = value; } }, setAttribute() {}, appendChild() {}, remove() { this.removed = true; } }),
      body: { appendChild(element) { indicators.push(element); } },
    },
    window: { matchMedia: () => ({ matches: systemReduced }) },
    setTimeout(callback) { const timer = { callback }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cancelled = true; },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: key => frames.delete(key),
  };
  const prefix = "const {document, window, setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame} = globalThis.backSwipeMotionHarness;\n";
  const { createBackSwipeMotion } = await import(`data:text/javascript;base64,${Buffer.from(prefix + compiled).toString("base64")}#${id++}`);
  delete globalThis.backSwipeMotionHarness;
  function step() {
    time += 16;
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(time));
  }
  function drain() { for (let i = 0; frames.size && i < 100; i++) step(); assert.equal(frames.size, 0); }
  return { motion: createBackSwipeMotion(), surface, animations, timers, frames, indicators, classes, step, drain };
}

test("continuous nudge follows progress, then fades the destination at rest", async () => {
  const h = await harness();
  h.motion.progress(0.5);
  h.step();
  assert.ok(parseFloat(h.surface.style.translate) > 0 && parseFloat(h.surface.style.translate) < 20);
  h.motion.progress(1);
  let navigated = false;
  const navigation = h.motion.navigate(() => { navigated = true; });
  assert.equal(navigated, false);
  h.drain();
  assert.equal(h.surface.style.translate, "40px");
  await navigation;
  assert.equal(navigated, true);
  assert.equal(h.surface.style.translate, "");
  h.step();
  assert.deepEqual(h.animations[0].keyframes, [{ opacity: 0.25 }, { opacity: 1 }]);
  assert.equal(h.animations[0].options.duration, 300);
  h.animations[0].onfinish();
  assert.equal(h.classes.size, 0);
  assert.equal(h.indicators[0].removed, true);
});
test("an incomplete swipe settles continuously and removes the glass chevron", async () => {
  const h = await harness();
  h.motion.progress(0.5); h.drain();
  assert.equal(h.surface.style.translate, "20px");
  h.timers.at(-1).callback(); h.step();
  assert.ok(parseFloat(h.surface.style.translate) > 0 && parseFloat(h.surface.style.translate) < 20);
  h.drain();
  assert.equal(h.surface.style.translate, "");
  assert.equal(h.indicators[0].removed, true);
});
test("Allora and system Reduce Motion skip nudge, chevron and fade while preserving Back", async () => {
  for (const preference of [{ appReduced: true }, { systemReduced: true }]) {
    const h = await harness(preference);
    let backs = 0;
    h.motion.progress(1);
    await h.motion.navigate(() => { backs++; });
    assert.equal(backs, 1);
    assert.equal(h.animations.length, 0);
    assert.equal(h.frames.size, 0);
    assert.equal(h.indicators.length, 0);
  }
});
test("failed Back clears nudge and chevron without fading another page", async () => {
  const h = await harness();
  h.motion.progress(1); h.drain();
  await assert.rejects(h.motion.navigate(async () => { throw new Error("Save failed"); }), /Save failed/);
  assert.equal(h.surface.style.translate, "");
  assert.equal(h.frames.size, 0);
  assert.equal(h.indicators[0].removed, true);
});
test("slow retargeting uses one frame loop and never jumps or restarts animations", async () => {
  const h = await harness();
  h.motion.progress(0.25); h.step();
  const first = parseFloat(h.surface.style.translate);
  h.motion.progress(0.4);
  assert.equal(parseFloat(h.surface.style.translate), first);
  assert.equal(h.frames.size, 1);
  h.step();
  assert.ok(parseFloat(h.surface.style.translate) > first);
  assert.ok(parseFloat(h.surface.style.translate) < 16);
  assert.equal(h.animations.length, 0);
  assert.equal(h.indicators.length, 1);
  h.drain();
  assert.equal(h.surface.style.translate, "16px");
});
