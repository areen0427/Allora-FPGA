import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const files = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];

function fixture(t, newline) {
  // Keep temporary writes inside the worktree; never change the real manifests.
  const root = mkdtempSync(path.join(appRoot, '.release-version-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts'));
  mkdirSync(path.join(root, 'src-tauri'));
  copyFileSync(path.join(appRoot, 'scripts/set-release-version.mjs'), path.join(root, 'scripts/set-release-version.mjs'));
  for (const file of files) {
    writeFileSync(path.join(root, file), readFileSync(path.join(appRoot, file), 'utf8').replace(/\r?\n/g, newline));
  }
  return { root, run: tag => spawnSync(process.execPath, [path.join(root, 'scripts/set-release-version.mjs')], {
    env: { ...process.env, RELEASE_TAG: tag }, encoding: 'utf8',
  }) };
}

for (const [label, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  for (const [tag, version] of [['v0.3.6', '0.3.6'], ['windows-v0.1.0-preview.2', '0.1.0-preview.2']]) {
    test(`release version updates all manifests for ${tag} with ${label}`, t => {
      const { root, run } = fixture(t, newline);
      const before = Object.fromEntries(files.slice(3).map(file => [file, readFileSync(path.join(root, file), 'utf8')]));
      const result = run(tag);
      assert.equal(result.status, 0, result.stderr);
      for (const file of files.slice(0, 3)) {
        const manifest = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
        assert.equal(manifest.version, version);
        if (file === 'package-lock.json') assert.equal(manifest.packages[''].version, version);
      }
      for (const file of files.slice(3)) {
        const contents = readFileSync(path.join(root, file), 'utf8');
        // Only the app version changes; dependency versions and line endings survive.
        const pattern = file.endsWith('.toml')
          ? /^(\[package\][\s\S]*?\r?\nversion = ")[^"]+/m
          : /(\[\[package\]\]\r?\nname = "app"\r?\nversion = ")[^"]+/;
        assert.equal(contents, before[file].replace(pattern, `$1${version}`));
      }
    });
  }
}

test('invalid release tags fail without modifying manifests', t => {
  const { root, run } = fixture(t, '\r\n');
  const before = files.map(file => readFileSync(path.join(root, file), 'utf8'));
  for (const tag of ['main', 'v01.2.3', 'windows-v0.1.0-preview.02', 'v0.1.0;echo bad']) {
    const result = run(tag);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Expected a release tag/);
    assert.deepEqual(files.map(file => readFileSync(path.join(root, file), 'utf8')), before);
  }
});

test('missing app lock entry fails before any manifest is written', t => {
  const { root, run } = fixture(t, '\n');
  const lock = path.join(root, 'src-tauri/Cargo.lock');
  writeFileSync(lock, readFileSync(lock, 'utf8').replace('name = "app"', 'name = "missing-app"'));
  const before = files.map(file => readFileSync(path.join(root, file), 'utf8'));
  const result = run('windows-v0.1.0-preview.2');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Could not find app version/);
  assert.deepEqual(files.map(file => readFileSync(path.join(root, file), 'utf8')), before);
});
