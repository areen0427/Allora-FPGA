import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/generatedBitstream.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const resolve = exports.resolveGeneratedBitstream;
const file = (path) => ({ name: path.split("/").pop(), path, content: "", isBinary: true });
test("programmer automatically uses the generator output instead of internal copies or other binaries", () => {
  const generated = file("/project/build/demo.bin");
  const files = [file("/project/build/allora-ai/artifact.bin"), file("/project/src/demo.bin"), file("/project/build/old.bin"), generated];
  assert.equal(resolve(files, "/project", "demo", "iCE40"), generated);
  assert.equal(resolve(files.slice(0, 3), "/project", "demo", "iCE40"), undefined);
  assert.equal(resolve(files, "/other", "demo", "iCE40"), undefined);
  assert.equal(resolve(files, undefined, "demo", "iCE40"), undefined);
});
test("generated output follows board format and native filename sanitization", () => {
  const bit = file("/project/build/demo__name.bit");
  const bin = file("/project/build/demo__name.bin");
  assert.equal(resolve([bin, bit], "/project/", " demo--name ", "ECP5"), bit);
  assert.equal(resolve([bit, bin], "/project", " demo--name ", "ice40"), bin);
  const fallback = file("/project/build/allora_project.bin");
  assert.equal(resolve([fallback], "/project", "---", "ice40"), fallback);
});
