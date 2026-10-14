import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/projectMetadata.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function('require', 'exports', code)(name => name.includes('boards') ? {
  VIRTUAL_BOARD: { id: 'allora-virtual' }, getBoardById: id => ['allora-virtual', 'ulx3s-85f'].includes(id),
} : { findTopModuleFile: (files, top) => files.find(file => file.content.includes(`module ${top}(`))?.name }, api);
const project = { id: 'existing', boardId: 'allora-virtual', projectKind: 'simulation', lastExecutionTarget: 'simulate', topLevelFileName: 'model.v', activeFileName: 'model.v' };
const files = [
  { name: 'allora-project.json', content: JSON.stringify({ boardId: 'ulx3s-85f', topModule: 'board_top', projectKind: 'simulation' }) },
  { name: 'board_top.v', content: 'module board_top(input clk); endmodule' },
  { name: 'constraints.lpf', content: 'LOCATE COMP "clk" SITE "G2";' },
];
test('chat conversion updates board, hardware target and top while preserving identity and constraints', () => {
  const next = api.reconcileProjectMetadata(project, files);
  assert.equal(next.id, project.id);
  assert.equal(next.boardId, 'ulx3s-85f');
  assert.equal(next.projectKind, 'hardware');
  assert.equal(next.lastExecutionTarget, 'build');
  assert.equal(next.topLevelFileName, 'board_top.v');
  assert.equal(next.activeFileName, 'model.v');
  assert.equal(next.files, files);
});
test('reopening a stale virtual record uses disk metadata too', () => {
  assert.equal(api.reconcileProjectMetadata(project, files).boardId, 'ulx3s-85f');
  assert.throws(() => api.reconcileProjectMetadata(project, [{ name: 'allora-project.json', content: '{' }]));
  assert.throws(() => api.reconcileProjectMetadata(project, [{ name: 'allora-project.json', content: '{"boardId":"missing"}' }]));
});
