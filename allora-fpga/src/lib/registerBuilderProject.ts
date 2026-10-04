import { invokeTauri } from "./tauri.ts";
import { digest } from "./memoryAssets.ts";
import {
  emptyMap,
  generateFiles,
  generationKey,
  manifestPath,
  parseManifest,
  serializeManifest,
} from "./registerBuilder.ts";
import type {
  Integration,
  RegisterManifest,
  RegisterMap,
} from "./registerBuilder.ts";
import type { ProjectFile } from "../pages/dashboard/types";
export type FileChange = {
  path: string;
  content: Uint8Array | null;
  expected: Uint8Array | null;
};
export type RegisterFileService = {
  read: (path: string) => Promise<Uint8Array | null>;
  commit: (changes: FileChange[]) => Promise<void>;
};
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
export function registerFileService(projectPath: string): RegisterFileService {
  return {
    read: async (relativePath) => {
      const result = await invokeTauri<number[] | null>("read_asset_file", {
        request: { projectPath, relativePath },
      });
      return result === null ? null : Uint8Array.from(result);
    },
    commit: (changes) =>
      invokeTauri("commit_asset_files", {
        requests: changes.map((c) => ({
          projectPath,
          relativePath: c.path,
          content: c.content === null ? null : Array.from(c.content),
          expected: c.expected === null ? null : Array.from(c.expected),
        })),
      }),
  };
}
/** Uses the same guarded, staged transaction as Memory Asset Studio. No force overwrite. */
export class RegisterProjectStore {
  manifest: RegisterManifest = {
    schemaVersion: 1,
    map: emptyMap(),
    outputs: [],
  };
  private bytes: Uint8Array | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly service: RegisterFileService;
  private readonly root: string;
  constructor(service: RegisterFileService, root: string) {
    this.service = service;
    this.root = root;
  }
  async load() {
    this.bytes = await this.service.read(manifestPath);
    if (this.bytes) this.manifest = parseManifest(decoder.decode(this.bytes));
    return this.manifest;
  }
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  private async persist(next: RegisterManifest, changes: FileChange[] = []) {
    const bytes = encoder.encode(serializeManifest(next));
    await this.service.commit([
      ...changes,
      { path: manifestPath, content: bytes, expected: this.bytes },
    ]);
    this.manifest = next;
    this.bytes = bytes;
    return {
      name: manifestPath,
      path: `${this.root}/${manifestPath}`,
      content: decoder.decode(bytes),
    } satisfies ProjectFile;
  }
  saveMap(map: RegisterMap) {
    return this.enqueue(() => this.persist({ ...this.manifest, map }));
  }
  generate(map: RegisterMap, integration?: Integration) {
    return this.enqueue(async () => {
      const texts = generateFiles(map, integration),
        changes: FileChange[] = [],
        outputs: RegisterManifest["outputs"] = [];
      // All existing paths must belong to this manifest and retain their recorded content hash.
      for (const path of new Set([
        ...this.manifest.outputs.map((o) => o.path),
        ...Object.keys(texts),
      ])) {
        const prior = await this.service.read(path),
          owned = this.manifest.outputs.find((o) => o.path === path);
        if (prior && (!owned || (await digest(prior)) !== owned.hash))
          throw new Error(
            `${path} exists or was edited outside Register Builder. Preserve it or move it before regenerating. No files were changed.`,
          );
        const content =
          texts[path] === undefined ? null : encoder.encode(texts[path]);
        changes.push({ path, content, expected: prior });
        if (content) outputs.push({ path, hash: await digest(content) });
      }
      const next: RegisterManifest = {
        schemaVersion: 1,
        map,
        outputs,
        generatedKey: generationKey(map, integration),
        ...(integration ? { integration } : {}),
      };
      const manifestFile = await this.persist(next, changes);
      return {
        files: [
          manifestFile,
          ...Object.entries(texts).map(([name, content]) => ({
            name,
            content,
            path: `${this.root}/${name}`,
          })),
        ],
        removed: changes.filter((c) => c.content === null).map((c) => c.path),
        manifest: next,
      };
    });
  }
}
