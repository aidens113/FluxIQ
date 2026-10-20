// Whether a cache root leaves Windows enough room to write a build below it.
//
// Windows' default limit is 260 characters including the terminating NUL, so
// a path may be 259. Next writes deep: the deepest file measured in a real
// published build is 178 characters below the cache root,
//
//   <key>/<attempt>/apps/web/.next/server/app/api/programs/automation-studio/
//   run-datasets/[projectId]/[runId]/[datasetId]/route/server-reference-manifest.json
//
// which leaves 80 characters for the root itself. Three builds once died
// inside Turbopack with "path length ... exceeds max length of filesystem",
// reported as an unexplained build failure, because a worktree's name made
// the cache root 82 characters. This answers in a sentence about path length
// before the build starts.
//
// DEEPEST_RELATIVE_PATH is measured, not derived: re-measure it with
// `find <cacheRoot> -type f` over a published build when the route tree grows.

const DEEPEST_RELATIVE_PATH = 178;
/** Windows' MAX_PATH, less the terminating NUL. */
const WINDOWS_PATH_LIMIT = 259;

/**
 * @param {string} cacheRoot the directory keyed builds are written below
 * @param {string} [platform]
 * @returns {{ fits: boolean, root: number, allowed: number, longest: number, limit: number }}
 */
export function webBuildPathBudget(cacheRoot, platform = process.platform) {
  // Only Windows has a limit this low. Elsewhere the check would refuse builds
  // that work, which is worse than the failure it prevents.
  const allowed = platform === "win32" ? WINDOWS_PATH_LIMIT - DEEPEST_RELATIVE_PATH - 1 : Number.MAX_SAFE_INTEGER;
  return { fits: cacheRoot.length <= allowed, root: cacheRoot.length, allowed, longest: cacheRoot.length + 1 + DEEPEST_RELATIVE_PATH, limit: WINDOWS_PATH_LIMIT };
}
