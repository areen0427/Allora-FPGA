import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/hooks/useModalFocus.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace(/^import .*;\n/gm, "");
let moduleId = 0;

async function createHarness() {
  let effects = [];
  const listeners = new Set();
  const document = {
    activeElement: null,
    nativeDialog: null,
    querySelector: () => document.nativeDialog,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  globalThis.modalFocusHarness = {
    useRef: (current) => ({ current }),
    useEffect: (effect) => effects.push(effect),
  };
  const { useModalFocus } = await import(`data:text/javascript;base64,${Buffer.from(
    `const { useRef, useEffect } = globalThis.modalFocusHarness;\n${compiled}`,
  ).toString("base64")}#${moduleId++}`);
  delete globalThis.modalFocusHarness;

  function element(children = [], options = {}) {
    return {
      ownerDocument: document,
      tabIndex: 0,
      isConnected: true,
      disabled: false,
      hidden: false,
      inert: false,
      children,
      querySelectorAll: () => children,
      getClientRects() { return this.hidden ? [] : [{}]; },
      matches() { return this.disabled; },
      closest() { return this.inert ? this : null; },
      contains(target) { return target === this || children.some(child => child.contains(target)); },
      focus() { document.activeElement = this; },
      ...options,
    };
  }
  return {
    document,
    element,
    mount(dialog, onClose, initial) {
      effects = [];
      useModalFocus({ current: dialog }, onClose, initial ? { current: initial } : undefined);
      const cleanups = effects.map(effect => effect()).filter(Boolean);
      return () => cleanups.forEach(cleanup => cleanup());
    },
    key(key, options = {}) {
      const event = {
        key,
        shiftKey: false,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        ...options,
      };
      for (const listener of [...listeners]) listener(event);
      return event;
    },
  };
}

test("blocking dialogs enter their chosen control and restore the opener", async () => {
  const h = await createHarness();
  const opener = h.element(), close = h.element(), category = h.element();
  opener.focus();
  const unmount = h.mount(h.element([close, category]), () => {}, category);
  assert.equal(h.document.activeElement, category);
  unmount();
  assert.equal(h.document.activeElement, opener);
});

test("Tab wraps both ways and excludes hidden, disabled, inert and untabbable controls", async () => {
  const h = await createHarness();
  const hidden = h.element([], { hidden: true });
  const disabled = h.element([], { disabled: true });
  const inert = h.element([], { inert: true });
  const skipped = h.element([], { tabIndex: -1 });
  const first = h.element(), last = h.element();
  const unmount = h.mount(h.element([hidden, disabled, inert, skipped, first, last]), () => {});
  assert.equal(h.document.activeElement, first);
  assert.equal(h.key("Tab", { shiftKey: true }).defaultPrevented, true);
  assert.equal(h.document.activeElement, last);
  h.key("Tab");
  assert.equal(h.document.activeElement, first);
  h.element().focus();
  h.key("Tab");
  assert.equal(h.document.activeElement, first, "focus that escaped returns to the modal");
  unmount();
});

test("nested Escape closes only the top modal and restores its parent's control", async () => {
  const h = await createHarness();
  const opener = h.element(), parentControl = h.element(), childControl = h.element();
  let parentClosed = 0, childClosed = 0;
  opener.focus();
  const closeParent = h.mount(h.element([parentControl]), () => parentClosed++);
  const closeChild = h.mount(h.element([childControl]), () => childClosed++);
  h.key("Escape");
  assert.equal(childClosed, 1);
  assert.equal(parentClosed, 0);
  closeChild();
  assert.equal(h.document.activeElement, parentControl);
  h.key("Escape");
  assert.equal(parentClosed, 1);
  closeParent();
  assert.equal(h.document.activeElement, opener);
});

test("specialized Escape handlers and native modal dialogs keep ownership", async () => {
  const h = await createHarness();
  let closed = 0;
  const control = h.element();
  const unmount = h.mount(h.element([control]), () => closed++);
  h.key("Escape", { defaultPrevented: true });
  assert.equal(closed, 0);
  const nativeControl = h.element();
  h.document.nativeDialog = h.element([nativeControl]);
  nativeControl.focus();
  assert.equal(h.key("Tab").defaultPrevented, false);
  assert.equal(h.document.activeElement, nativeControl);
  h.key("Escape");
  assert.equal(closed, 0);
  unmount();
});

test("a modal with no usable controls keeps focus without restoring a removed opener", async () => {
  const h = await createHarness();
  const opener = h.element(), dialog = h.element();
  opener.focus();
  const unmount = h.mount(dialog, () => {});
  assert.equal(h.document.activeElement, dialog);
  assert.equal(h.key("Tab").defaultPrevented, true);
  opener.isConnected = false;
  unmount();
  assert.equal(h.document.activeElement, dialog);
});
