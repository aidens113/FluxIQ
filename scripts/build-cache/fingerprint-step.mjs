// A step's fingerprint: a sha256 over what `resolveStep` says the step reads
// -- every input root's content digest -- and what it is -- stamp version,
// step name, command, Node version, platform, fingerprinted environment and
// output locations. Each root's digest is returned too, so a rebuild can name
// the root whose content changed, and so is the newest input file's
// modification time, which the no-touch rule compares with the outputs'.
//
// The checkout is listed by git once per fingerprint, never cached across
// fingerprints: the one taken after a build must see a file the build left
// behind.

import { createHash } from "node:crypto";
import { digestFiles, gitVisibleFiles, listRootFiles } from "./fingerprint/index.mjs";
import { resolveStep } from "./workspace/index.mjs";

/**
 * @param {string | ReturnType<typeof resolveStep>} step a registry name, or a step already resolved
 * @param {{ statCache: { hash(file: string): Promise<string>, mtimeMs(file: string): number | undefined }, repoRoot?: string, env?: NodeJS.ProcessEnv, steps?: object }} options
 * @returns {Promise<{ fingerprint: string, roots: Record<string, string>, newestInput: { ms: number, path: string | null } }>}
 */
export async function fingerprintStep(step, options) {
  const resolved = typeof step === "string" ? resolveStep(step, options) : step;
  let listing = null;
  const context = { repoRoot: resolved.repoRoot, gitFiles: () => (listing ??= gitVisibleFiles(resolved.repoRoot)) };
  const newestInput = { ms: 0, path: null };
  const digests = [];
  for (const root of resolved.roots) {
    const { digest, newestMs, newestPath } = await digestFiles(await listRootFiles(root, context), options.statCache);
    digests.push([root.label, digest]);
    if (newestMs > newestInput.ms) Object.assign(newestInput, { ms: newestMs, path: newestPath });
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ meta: resolved.meta, roots: digests })).digest("hex");
  return { fingerprint, roots: Object.fromEntries(digests), newestInput };
}
