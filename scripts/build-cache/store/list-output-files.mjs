// Every file a resolved step's output digest covers, with the output it
// belongs to and its path inside that output: what the store copies out after
// a build, and what a restore replaces. It lists exactly as `outputState`
// does, so a restored set of files digests to what was stored.

import { listRootFiles } from "../fingerprint/index.mjs";

/**
 * @param {{ repoRoot: string, outputs: { label: string, path: string, exclude: string[], match: RegExp | null }[] }} resolved
 * @returns {Promise<{ output: string, relative: string, path: string }[]>} `relative` is "" for an output that is a single file
 */
export async function listOutputFiles(resolved) {
  const context = { repoRoot: resolved.repoRoot, gitFiles: async () => [] };
  const files = [];
  for (const output of resolved.outputs) {
    for (const file of await listRootFiles({ kind: "walk", ...output }, context)) {
      if (file.path === null) continue;
      const relative = file.label === output.label ? "" : file.label.slice(output.label.length + 1);
      files.push({ output: output.label, relative, path: file.path });
    }
  }
  return files;
}
