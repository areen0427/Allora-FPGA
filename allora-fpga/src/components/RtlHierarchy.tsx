import { useMemo, useState } from "react";
import { ChevronRight, Boxes, FileCode2 } from "lucide-react";
import { buildRtlHierarchy, type RtlHierarchyNode } from "../lib/rtlHierarchy";
import type { ProjectFile } from "../pages/dashboard/types";

export function RtlHierarchy({
  files,
  topLevelFileName,
  onOpenDefinition,
}: {
  files: ProjectFile[];
  topLevelFileName: string | null;
  onOpenDefinition: (fileName: string, line: number) => void;
}) {
  const hierarchy = useMemo(
    () => buildRtlHierarchy(files, topLevelFileName),
    [files, topLevelFileName],
  );
  if (!hierarchy.count)
    return (
      <p className="rtl-hierarchy-empty">No RTL modules or entities found.</p>
    );
  return (
    <div className="rtl-hierarchy" aria-label="RTL hierarchy">
      {hierarchy.roots.length ? (
        <>
          <span className="rtl-hierarchy-caption">Top-level design</span>
          {hierarchy.roots.map((node) => (
            <HierarchyItem
              key={node.name}
              node={node}
              depth={0}
              onOpenDefinition={onOpenDefinition}
            />
          ))}
        </>
      ) : (
        <p className="rtl-hierarchy-empty">
          Select a top-level HDL file in the Files view.
        </p>
      )}
      {hierarchy.otherModules.length ? (
        <>
          <span className="rtl-hierarchy-caption">Other modules</span>
          {hierarchy.otherModules.map((node) => (
            <HierarchyItem
              key={`${node.fileName}:${node.name}`}
              node={node}
              depth={0}
              onOpenDefinition={onOpenDefinition}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function HierarchyItem({
  node,
  depth,
  onOpenDefinition,
}: {
  node: RtlHierarchyNode;
  depth: number;
  onOpenDefinition: (fileName: string, line: number) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  return (
    <div>
      <div
        className="rtl-hierarchy-row"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {node.children.length ? (
          <button
            type="button"
            className="rtl-hierarchy-toggle"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.instance ?? node.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronRight size={13} className={expanded ? "expanded" : ""} />
          </button>
        ) : (
          <span className="rtl-hierarchy-spacer" />
        )}
        {depth ? (
          <FileCode2 size={14} aria-hidden="true" />
        ) : (
          <Boxes size={15} aria-hidden="true" />
        )}
        <button
          type="button"
          className="rtl-hierarchy-definition"
          onClick={() => onOpenDefinition(node.fileName, node.line)}
          title={`${node.fileName}:${node.line}`}
        >
          <strong>{node.instance ?? node.name}</strong>
          {node.instance ? <small>{node.name}</small> : null}
        </button>
      </div>
      {expanded &&
        node.children.map((child, index) => (
          <HierarchyItem
            key={`${child.instance}:${index}`}
            node={child}
            depth={depth + 1}
            onOpenDefinition={onOpenDefinition}
          />
        ))}
    </div>
  );
}
