import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Release tags are authoritative; local manifests remain development defaults.
const tag = process.env.RELEASE_TAG;
const match = /^(?:windows-)?v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/.exec(tag ?? '');
if (!match || match[1].split('-').slice(1).join('-').split('.').some(part => /^0\d+$/.test(part))) {
  throw new Error(`Expected a release tag such as v0.3.0 or windows-v0.3.0-preview.1; got ${tag}`);
}
const version = match[1];
const root = fileURLToPath(new URL('../', import.meta.url));
const updates = [];
for (const file of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
  const target = path.join(root, file);
  const json = JSON.parse(readFileSync(target, 'utf8'));
  json.version = version;
  if (file === 'package-lock.json') json.packages[''].version = version;
  updates.push([target, JSON.stringify(json, null, 2) + '\n']);
}
for (const [file, pattern] of [
  ['src-tauri/Cargo.toml', /^(\[package\][\s\S]*?\r?\nversion = ")[^"]+("[^\r\n]*)/m],
  ['src-tauri/Cargo.lock', /(\[\[package\]\]\r?\nname = "app"\r?\nversion = ")[^"]+("[^\r\n]*)/],
]) {
  const target = path.join(root, file);
  const source = readFileSync(target, 'utf8');
  if (!pattern.test(source)) throw new Error(`Could not find app version in ${file}`);
  updates.push([target, source.replace(pattern, `$1${version}$2`)]);
}
for (const [target, contents] of updates) writeFileSync(target, contents);
console.log(`App, product info, and installer version set to ${version} from ${tag}`);
