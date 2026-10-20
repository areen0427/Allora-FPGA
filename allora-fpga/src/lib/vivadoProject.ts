import { invokeTauri } from "./tauri";
import { parseImportSources, type ImportUnit } from "./portImport";

export type VivadoProject = {
  topModule: string;
  sourcePaths: string[];
  warnings: string[];
};
export type DesignImport = {
  units: ImportUnit[];
  topModule?: string;
  warnings: string[];
};
type ImportFile = { path: string; content: string };
export function readPinImportFiles(paths: string[]) {
  return invokeTauri<ImportFile[]>("read_pin_import_files", { paths });
}

export function resolveVivadoPath(
  projectPath: string,
  reference: string,
): string {
  const project = projectPath.replace(/\\/g, "/");
  const directory = project.slice(0, project.lastIndexOf("/"));
  const basename = project
    .slice(project.lastIndexOf("/") + 1)
    .replace(/\.xpr$/i, "");
  let path = reference
    .replace(/\\/g, "/")
    .replace(/\$(?:\{PPRDIR\}|PPRDIR)(?![A-Za-z0-9_])/g, directory)
    .replace(
      /\$(?:\{PSRCDIR\}|PSRCDIR)(?![A-Za-z0-9_])/g,
      `${directory}/${basename}.srcs`,
    )
    .replace(
      /\$(?:\{PGENDIR\}|PGENDIR)(?![A-Za-z0-9_])/g,
      `${directory}/${basename}.gen`,
    );
  if (path.includes("$") || /[\r\n\0]/.test(path))
    throw new Error(`Unresolved Vivado path: ${reference}`);
  if (!/^(?:\/|[A-Za-z]:\/)/.test(path)) path = `${directory}/${path}`;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === ".") continue;
    if (part === "..") {
      if (parts.length <= 1)
        throw new Error(`Invalid Vivado path: ${reference}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

/** Read XML as data only. No Tcl, hooks, IP generators or vendor tools are executed. */
export function parseVivadoProject(
  xml: string,
  projectPath: string,
): VivadoProject {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Vivado XML document types and entities are unsupported.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (
    document.querySelector("parsererror") ||
    document.documentElement.tagName !== "Project"
  )
    throw new Error("This is not a valid Vivado .xpr project.");
  const sets = Array.from(
    document.querySelectorAll('FileSets > FileSet[Type="DesignSrcs"]'),
  );
  if (sets.length !== 1)
    throw new Error(
      "Select a Vivado RTL project with one design source set, or import its generated top-level wrapper directly.",
    );
  const set = sets[0];
  const options = Array.from(set.querySelectorAll("Config > Option"));
  const topModule =
    options
      .find((option) => option.getAttribute("Name") === "TopModule")
      ?.getAttribute("Val") ?? "";
  const warnings = [
    "Only output ports are imported. Existing XDC assignments, board selection and project files are unchanged.",
  ];
  const sourcePaths: string[] = [];
  for (const file of Array.from(set.querySelectorAll(":scope > File"))) {
    const attributes = Array.from(file.querySelectorAll("FileInfo > Attr"));
    if (
      attributes.some(
        (attr) =>
          attr.getAttribute("Name") === "IsEnabled" &&
          /^(?:0|false)$/i.test(attr.getAttribute("Val") ?? ""),
      )
    )
      continue;
    const uses = attributes
      .filter((attr) => attr.getAttribute("Name") === "UsedIn")
      .map((attr) => attr.getAttribute("Val"));
    if (uses.length && !uses.includes("synthesis")) continue;
    const path = file.getAttribute("Path") ?? "";
    if (/\.(?:v|sv|vhd|vhdl)$/i.test(path))
      sourcePaths.push(resolveVivadoPath(projectPath, path));
    else if (path)
      warnings.push(
        `Not parsed: ${path}. IP/block designs require an existing generated HDL wrapper; Allora does not generate it.`,
      );
  }
  if (!sourcePaths.length)
    throw new Error(
      "No synthesis HDL sources found. Generate the top-level HDL wrapper in Vivado, then import that file.",
    );
  return { topModule, sourcePaths: [...new Set(sourcePaths)], warnings };
}

export async function importVivadoProject(path: string): Promise<DesignImport> {
  const [project] = await readPinImportFiles([path]);
  const parsed = parseVivadoProject(project.content, path);
  const files = await readPinImportFiles(parsed.sourcePaths);
  const units = parseImportSources(
    files.map((file) => ({ name: file.path, content: file.content })),
  );
  return { units, topModule: parsed.topModule, warnings: parsed.warnings };
}
