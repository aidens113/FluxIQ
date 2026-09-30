// A step's outputs as they are on disk now: their content digest and their
// newest modification time. A stamp records the digest after a successful
// build and a reuse requires it unchanged, so an output deleted, edited or
// half-overwritten since (by a crashed build, a clean, or a hand edit) is
// rebuilt rather than trusted. A check has no outputs; its digest is that of
// the empty list.

import { digestFiles } from "./digest-files.mjs";
import { listRootFiles } from "./list-root-files.mjs";

/**
 * @param {{ repoRoot: string, outputs: { label: string, path: string, exclude: string[], match: RegExp | null }[] }} resolved
 * @param {{ hash(file: string): Promise<string>, mtimeMs(file: string): number | undefined }} statCache
 * @returns {Promise<{ digest: string, newestMs: number, newestPath: string | null }>}
 */
export async function outputState(resolved, statCache) {
  const files = [];
  const context = { repoRoot: resolved.repoRoot, gitFiles: async () => [] };
  for (const output of resolved.outputs) files.push(...(await listRootFiles({ kind: "walk", ...output }, context)));
  return digestFiles(files, statCache);
}
