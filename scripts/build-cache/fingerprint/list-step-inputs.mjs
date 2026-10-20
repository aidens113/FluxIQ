// Every file a resolved step's fingerprint hashes, root by root, exactly as
// `fingerprint-step.mjs` lists them: the coverage proof holds what a compiler
// loads against this, and a registry test asks it whether one file is an
// input. Git lists the checkout once for the whole step.

import { gitVisibleFiles } from "./git-visible-files.mjs";
import { listRootFiles } from "./list-root-files.mjs";

/**
 * @param {{ repoRoot: string, roots: Parameters<typeof listRootFiles>[0][] }} resolved
 * @returns {Promise<{ label: string, path: string | null }[]>} absent roots included, as `listRootFiles` lists them
 */
export async function listStepInputs(resolved) {
  let listing = null;
  const context = { repoRoot: resolved.repoRoot, gitFiles: () => (listing ??= gitVisibleFiles(resolved.repoRoot)) };
  const files = [];
  for (const root of resolved.roots) files.push(...(await listRootFiles(root, context)));
  return files;
}
