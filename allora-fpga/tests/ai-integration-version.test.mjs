import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/aiIntegration.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace(/^import .*;\n/gm, "");
const { codexNeedsUpdate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Sol catalog update guidance applies to releases before 0.159.1", () => {
  for (const version of ["0.156.1", "0.158.9", "0.159.0"]) {
    assert.equal(codexNeedsUpdate(`codex-cli ${version}`), true);
  }
  for (const version of ["0.159.1", "0.159.3", "0.160.0", "1.0.0"]) {
    assert.equal(codexNeedsUpdate(`codex-cli ${version}`), false);
  }
});

test("unknown CLI versions do not invent an update requirement", () => {
  for (const version of [undefined, "", "unexpected", "codex-cli 0.15"]) {
    assert.equal(codexNeedsUpdate(version), false);
  }
});
