/** Source references are resolved against the project recorded for their reply. */
export type ChatSourceReference = {
  path: string;
  relativePath: string;
  line: number;
  column?: number;
  endLine?: number;
};

function normalizePath(value: string): string | undefined {
  const path = value.replaceAll("\\", "/");
  const drive = /^[a-z]:\//i.exec(path)?.[0];
  const absolute = path.startsWith("/") || Boolean(drive);
  const parts: string[] = [];
  for (const part of path.slice(drive?.length ?? 0).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return `${drive ? drive.toLowerCase() : absolute ? "/" : ""}${parts.join("/")}`;
}

export function safeChatDocumentationUrl(value: string): string | undefined {
  if (!/^https?:\/\//i.test(value) || [...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return undefined;
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function parseChatSourceReference(value: string, projectPath?: string): ChatSourceReference | undefined {
  if (!projectPath || !value || value.length > 4096) return undefined;
  let input: string;
  try { input = decodeURIComponent(value); } catch { return undefined; }
  if ([...input].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return undefined;
  if (/^(?:https?|file|javascript|data):/i.test(input)) return undefined;
  const location = /(?::([1-9]\d*)(?::([1-9]\d*))?|#L([1-9]\d*)(?:C([1-9]\d*))?(?:-L?([1-9]\d*))?)$/.exec(input);
  const line = Number(location?.[1] ?? location?.[3] ?? 1);
  const column = location?.[2] ?? location?.[4];
  const endLine = location?.[5];
  if (![line, ...(column ? [Number(column)] : []), ...(endLine ? [Number(endLine)] : [])].every(n => Number.isSafeInteger(n) && n > 0 && n <= 1_000_000_000)) return undefined;
  if (endLine && Number(endLine) < line) return undefined;
  input = (location ? input.slice(0, location.index) : input).trim();
  // A filename extension separates source paths from prose, symbols and URI schemes.
  if (!/\.[a-z\d][a-z\d_-]*$/i.test(input) || /[<>"|?#]/.test(input) || input.startsWith("//") || input.startsWith("\\\\")) return undefined;
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^[a-z]:[\\/]/i.test(input)) return undefined;
  const project = normalizePath(projectPath);
  if (!project || !/^(?:\/|[a-z]:\/)/i.test(project)) return undefined;
  const projectPrefix = project.endsWith("/") ? project : `${project}/`;
  const absolute = /^(?:\/|[a-z]:[\\/])/i.test(input);
  const path = normalizePath(absolute ? input : `${projectPrefix}${input}`);
  if (!path || !path.startsWith(projectPrefix)) return undefined;
  const relativePath = path.slice(projectPrefix.length);
  if (!relativePath) return undefined;
  return { path, relativePath, line, ...(column ? { column: Number(column) } : {}), ...(endLine ? { endLine: Number(endLine) } : {}) };
}

/** Exact paths only. A basename is never guessed when a file has a real path. */
export function findChatSourceFile<T extends { name: string; path?: string; isBinary?: boolean }>(
  files: readonly T[], reference: ChatSourceReference, projectPath: string,
): T | undefined {
  const matches = files.filter(file => {
    if (file.isBinary) return false;
    const candidate = parseChatSourceReference(file.path ?? file.name, projectPath);
    return candidate?.path === reference.path;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** Unquoted prose paths must include a line, so ordinary HDL identifiers stay plain. */
export const CHAT_PROSE_SOURCE_PATTERN = /^(?:(?:[a-z]:)?[\\/]|\.\.?[\\/])?(?:[\w.@+-]+[\\/])*[\w@+-]+\.[a-z\d_-]+(?::[1-9]\d*(?::[1-9]\d*)?|#L[1-9]\d*(?:C[1-9]\d*)?(?:-L?[1-9]\d*)?)/i;
