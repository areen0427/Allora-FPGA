import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";
import { getPinTypeColor } from "../src/data/pinResourceGroups.ts";

test("pinout browser and workspace share theme-aware clock and generic pin colors", async () => {
  assert.deepEqual(getPinTypeColor("clock"), {
    background: "var(--ui-control-active-bg)",
    color: "var(--ui-accent-text)",
  });
  assert.deepEqual(getPinTypeColor("gpio"), {
    background: "var(--ui-control-bg)",
    color: "var(--ui-text-muted)",
  });
  for (const file of ["welcome/PinMappingBrowser.tsx", "dashboard/PinMappingSection.tsx"]) {
    const source = await readFile(new URL(`../src/pages/${file}`, import.meta.url), "utf8");
    assert.match(source, /import\s*\{[^}]*getPinTypeColor[^}]*\}\s*from\s*"\.\.\/\.\.\/data\/pinResourceGroups"/);
    assert.doesNotMatch(source, /function getPinTypeColor\(/);
  }
});

test("inline UI material uses theme tokens even in conditional styles", async () => {
  const fixedForegrounds = new Set(["#2563eb", "#1d4ed8", "#0f172a", "#334155", "#475569", "#64748b", "#94a3b8"]);
  const src = new URL("../src/", import.meta.url);
  const files = (await readdir(src, { recursive: true })).filter(file => file.endsWith(".tsx"));
  for (const file of files) {
    const source = await readFile(new URL(file, src), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const violations = [];
    function visit(node) {
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === "style") {
        function check(value) {
          if (ts.isPropertyAssignment(value) && /^(color|background|backgroundColor|border|borderColor)$/.test(value.name.getText(ast))) {
            function checkLiteral(literal) {
              if (ts.isStringLiteral(literal) && [...fixedForegrounds].some(color => literal.text.toLowerCase().includes(color))) {
                violations.push(`${file}:${ast.getLineAndCharacterOfPosition(literal.getStart(ast)).line + 1} ${literal.text}`);
              }
              ts.forEachChild(literal, checkLiteral);
            }
            checkLiteral(value.initializer);
          }
          ts.forEachChild(value, check);
        }
        check(node.initializer);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.deepEqual(violations, [], "Fixed Ice foregrounds bypass Black Ice tokens");
  }
});

test("both theme palettes keep UI and status text readable on their paired surfaces", async () => {
  const source = await readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  function palette(selector) {
    const block = source.slice(source.indexOf(`${selector} {`)).split("\n}")[0];
    return Object.fromEntries([...block.matchAll(/--ui-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
  }
  function rgba(value) {
    if (value.startsWith("#")) return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)).concat(1);
    return value.match(/[\d.]+/g).map(Number);
  }
  function luminance(rgb) {
    const linear = rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }
  const ice = palette(":root");
  for (const [theme, values] of [["Ice", ice], ["Black Ice", { ...ice, ...palette('html[data-theme="black-ice"]') }]]) {
    const panel = rgba(values.panel);
    for (const role of ["text", "text-muted", "accent-text", "success-text", "warning-text", "error-text"]) {
      const backdrop = role.endsWith("-text") && /success|warning|error/.test(role) ? rgba(values[role.replace("-text", "-bg")]) : panel;
      const background = backdrop.slice(0, 3).map((channel, i) => channel * backdrop[3] + panel[i] * (1 - backdrop[3]));
      const foregroundLight = luminance(rgba(values[role])), backgroundLight = luminance(background);
      const contrast = (Math.max(foregroundLight, backgroundLight) + 0.05) / (Math.min(foregroundLight, backgroundLight) + 0.05);
      assert.ok(contrast >= 4.5, `${theme} ${role} contrast: ${contrast.toFixed(2)}`);
    }
  }
});
