import { isHdlFile } from "../hooks/utils";
import type { ProjectFile } from "../pages/dashboard/types";

export type RtlHierarchyNode = {
  name: string;
  instance?: string;
  fileName: string;
  line: number;
  children: RtlHierarchyNode[];
  recursive?: boolean;
};

type Definition = Omit<RtlHierarchyNode, "children"> & {
  body: string;
  instances: { module: string; name: string }[];
};

function lineAt(source: string, offset: number) {
  return source.slice(0, offset).split("\n").length;
}

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));
}

export function buildRtlHierarchy(
  files: ProjectFile[],
  topLevelFileName: string | null,
) {
  const definitions = new Map<string, Definition>();
  for (const file of files) {
    if (!isHdlFile(file.name) || file.isBinary) continue;
    const isVhdl = /\.vhdl?$/i.test(file.name);
    const source = isVhdl
      ? file.content.replace(/--[^\n]*/g, (match) => " ".repeat(match.length))
      : stripComments(file.content);
    if (isVhdl) {
      for (const match of source.matchAll(
        /\bentity\s+([a-zA-Z_]\w*)\s+is\b/gi,
      )) {
        const name = match[1];
        definitions.set(name.toLowerCase(), {
          name,
          fileName: file.name,
          line: lineAt(source, match.index),
          body: source,
          instances: [],
        });
      }
      continue;
    }
    for (const match of source.matchAll(
      /\bmodule\s+(?:automatic\s+)?([a-zA-Z_]\w*)\b([\s\S]*?)\bendmodule\b/g,
    )) {
      const name = match[1];
      definitions.set(name.toLowerCase(), {
        name,
        fileName: file.name,
        line: lineAt(source, match.index),
        body: match[2],
        instances: [],
      });
    }
  }

  for (const definition of definitions.values()) {
    if (/\.vhdl?$/i.test(definition.fileName)) {
      for (const match of definition.body.matchAll(
        /\b([a-zA-Z_]\w*)\s*:\s*(?:entity\s+\w+\.)?([a-zA-Z_]\w*)\s*(?:generic\s+map|port\s+map)\b/gi,
      )) {
        if (
          definitions.has(match[2].toLowerCase()) &&
          match[2].toLowerCase() !== definition.name.toLowerCase()
        ) {
          definition.instances.push({ name: match[1], module: match[2] });
        }
      }
    } else {
      for (const match of definition.body.matchAll(
        /(?:^|;)\s*([a-zA-Z_]\w*)\s*(?:#\s*\([^;]*?\)\s*)?([a-zA-Z_]\w*)\s*\(/gm,
      )) {
        if (definitions.has(match[1].toLowerCase())) {
          definition.instances.push({ module: match[1], name: match[2] });
        }
      }
    }
  }

  function expand(
    definition: Definition,
    ancestry: Set<string>,
    instance?: string,
  ): RtlHierarchyNode {
    const key = definition.name.toLowerCase();
    const recursive = ancestry.has(key);
    const next = new Set(ancestry);
    next.add(key);
    return {
      name: definition.name,
      instance,
      fileName: definition.fileName,
      line: definition.line,
      recursive,
      children: recursive
        ? []
        : definition.instances.flatMap((child) => {
            const target = definitions.get(child.module.toLowerCase());
            return target ? [expand(target, next, child.name)] : [];
          }),
    };
  }

  const topDefinition = [...definitions.values()].find(
    (definition) => definition.fileName === topLevelFileName,
  );
  const roots = topDefinition ? [expand(topDefinition, new Set())] : [];
  const reachable = new Set<string>();
  function visit(node: RtlHierarchyNode) {
    reachable.add(node.name.toLowerCase());
    node.children.forEach(visit);
  }
  roots.forEach(visit);
  const otherModules = [...definitions.values()]
    .filter((definition) => !reachable.has(definition.name.toLowerCase()))
    .map((definition) => expand(definition, new Set()));
  return { roots, otherModules, count: definitions.size };
}
