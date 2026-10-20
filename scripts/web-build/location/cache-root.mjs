// Where the keyed builds of one Core checkout's web panel live.
//
// Beside the Core, in `.tmp/web-build`, because every checkout or worktree
// that shares this Core must share one cache and therefore one lock per key:
// four task worktrees sharing one Core once each found an empty cache of
// their own and each started the same `next build` at the same time. The
// location must also be:
//
// - outside every `node_modules`: Turbopack treats a project whose own path
//   runs through `node_modules` as third-party code, and its build worker
//   aborts in seconds with exit 3221225501 (`inside-node-modules.mjs`);
// - short: Next writes 178 characters below it, and Windows allows 259
//   (`path-budget.mjs`);
// - ignored by git, so the cache never shows in `git status` (`.gitignore`
//   ignores `.tmp/`) and nothing that lists files through git scans it.
//
// `FLUXIQ_CORE_WEB_BUILD_CACHE` points it elsewhere. Deleting it costs one
// rebuild and loses nothing.

import path from "node:path";

/**
 * @param {string} repoRoot the Core checkout
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function webBuildCacheRoot(repoRoot, env = process.env) {
  const declared = env.FLUXIQ_CORE_WEB_BUILD_CACHE?.trim();
  if (declared) return path.resolve(declared);
  return path.join(path.resolve(repoRoot), ".tmp", "web-build");
}
