import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/pages/welcome/HomeView.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("HomeView.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "RecentProjectsCard");
const compiled = ts.transpileModule(component.getText(ast), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(projectCount) {
  let expanded = false;
  const opened = [], removed = [];
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
  const renderCard = new Function("React", "useState", "getRecentProjectBoardName", "formatProjectTime", "FolderClock", "SimulationRecentSummary", `${compiled}; return RecentProjectsCard;`)(
    React,
    () => [expanded, update => { expanded = update(expanded); }],
    () => "Board",
    () => "today",
    () => null,
    () => null,
  );
  return {
    opened, removed,
    render(options = {}) {
      const tree = renderCard({
        projects: Array.from({ length: projectCount }, (_, id) => ({ id: String(id), name: `Project ${id}`, boardId: "board", updatedAt: "today", files: [] })),
        onOpenProject: id => opened.push(id),
        onRemoveProject: id => removed.push(id),
        ...options,
      });
      const nodes = [];
      function visit(node) {
        if (!node || typeof node !== "object") return;
        nodes.push(node);
        node.children.forEach(visit);
      }
      visit(tree);
      return {
        rows: nodes.filter(node => node.props.className === "recent-project-row"),
        expand: nodes.find(node => node.props.className === "recent-projects-expand"),
        remove: nodes.filter(node => node.props.className === "recent-project-remove"),
      };
    },
  };
}

test("every recent-project card shows three, expands to at most five, and collapses", () => {
  for (const options of [{}, { showSimulationSummary: true }, { emptyMessage: "Memory projects" }]) {
    const card = harness(7);
    let rendered = card.render(options);
    assert.equal(rendered.rows.length, 3);
    assert.equal(rendered.expand.props["aria-label"], "Show 2 more recent projects");
    assert.equal(rendered.expand.props["aria-expanded"], false);
    rendered.expand.props.onClick();
    rendered = card.render(options);
    assert.equal(rendered.rows.length, 5);
    assert.equal(rendered.expand.props["aria-expanded"], true);
    rendered.expand.props.onClick();
    assert.equal(card.render(options).rows.length, 3);
  }
});

test("short lists need no expansion and removing a project does not open it", () => {
  for (const count of [0, 1, 3]) assert.equal(harness(count).render().expand, undefined);
  const card = harness(5);
  const rendered = card.render();
  let stopped = false;
  rendered.remove[0].props.onClick({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.deepEqual(card.removed, ["0"]);
  assert.deepEqual(card.opened, []);
  let prevented = false;
  rendered.rows[1].props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(card.opened, ["1"]);
});
