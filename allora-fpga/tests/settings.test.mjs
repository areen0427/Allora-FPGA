import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/data/settings.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { DEFAULT_SETTINGS, getSettings, saveSettings } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const key = "allora-fpga-settings";

function storage(value) {
  const items = new Map(value === undefined ? [] : [[key, JSON.stringify(value)]]);
  globalThis.window = {
    localStorage: {
      getItem: name => items.get(name) ?? null,
      setItem: (name, item) => items.set(name, item),
    },
  };
  return items;
}

test("HDL preference starts in Verilog and migrates older settings without changing other choices", () => {
  storage();
  assert.equal(getSettings().chatDefaultLanguage, "verilog");
  for (const value of [
    { theme: "black-ice", editorFontSize: 19 },
    { version: 10, settings: { theme: "black-ice", editorFontSize: 19 } },
  ]) {
    storage(value);
    const settings = getSettings();
    assert.equal(settings.chatDefaultLanguage, "verilog");
    assert.equal(settings.theme, "black-ice");
    assert.equal(settings.editorFontSize, 19);
  }
});

test("all three HDL choices survive persistence and reload", () => {
  for (const language of ["verilog", "systemverilog", "vhdl"]) {
    const items = storage();
    saveSettings({ ...DEFAULT_SETTINGS, chatDefaultLanguage: language });
    const saved = JSON.parse(items.get(key));
    assert.equal(saved.version, 11);
    assert.equal(saved.settings.chatDefaultLanguage, language);
    assert.equal(getSettings().chatDefaultLanguage, language);
  }
});

test("all five background choices survive persistence and reload", () => {
  for (const background of ["trace", "ultramatte", "molecules", "aether", "dawn"]) {
    const items = storage();
    saveSettings({ ...DEFAULT_SETTINGS, background });
    const saved = JSON.parse(items.get(key));
    assert.equal(saved.version, 11);
    assert.equal(saved.settings.background, background);
    assert.equal(getSettings().background, background);
  }
});

test("unknown backgrounds fall back without discarding other saved preferences", () => {
  for (const background of [undefined, null, "Aether", "night", 3, {}, ["dawn"]]) {
    storage({ version: 11, settings: { background, reduceMotion: true } });
    assert.equal(getSettings().background, "trace");
    assert.equal(getSettings().reduceMotion, true);
  }
});

test("invalid HDL preferences fall back safely without discarding saved settings", () => {
  for (const language of [undefined, null, "SystemVerilog", "python", 3, {}, ["vhdl"]]) {
    storage({ version: 11, settings: { chatDefaultLanguage: language, reduceMotion: true } });
    assert.equal(getSettings().chatDefaultLanguage, "verilog");
    assert.equal(getSettings().reduceMotion, true);
  }
});


test("the default chat folder survives saving and reloading settings", () => {
  for (const directory of ["/Users/example/Allora Projects", "D:\\Designs\\FPGA", null]) {
    const items = storage();
    saveSettings({ ...DEFAULT_SETTINGS, chatDefaultProjectDirectory: directory });
    assert.equal(JSON.parse(items.get(key)).settings.chatDefaultProjectDirectory, directory);
    assert.equal(getSettings().chatDefaultProjectDirectory, directory);
  }
});
