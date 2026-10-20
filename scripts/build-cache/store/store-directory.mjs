// Where one repository's part of the shared build store lives, or `null` when
// the store is switched off.
//
//   FLUXIQ_BUILD_CACHE_DIR=<dir>   use <dir>/<namespace>
//   FLUXIQ_BUILD_CACHE_DIR=off     no store: every step is stamped locally only
//   unset                          %LOCALAPPDATA%/fluxiq-build-cache/<namespace>
//                                  on Windows, $XDG_CACHE_HOME or ~/.cache
//                                  elsewhere
//
// One store per user and machine, outside every checkout, so a worktree made
// today reuses what another worktree built yesterday. Core's entries live
// under `core/` (the default namespace); the downstream web-extension
// repository passes `null` and keeps its entries at the top of the same
// directory. Each part has its own format directory, temporary directory and
// pruning (`entry-location.mjs`, `prune-store.mjs`), so neither repository's
// entries or pruning can touch the other's. A namespace is therefore one plain
// directory name, and never `tmp` or a format directory (`v1`, `v2`, ...),
// which would put one repository's entries inside the other's layout.

import os from "node:os";
import path from "node:path";

const NAME = "fluxiq-build-cache";
const CORE_NAMESPACE = "core";
const PLAIN_NAME = /^[a-z0-9][a-z0-9-]*$/u;
const LAYOUT_NAME = /^(?:tmp|v\d+)$/u;

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string | null} [namespace] the repository's directory in the store; `null` is the store's top
 * @returns {string | null}
 */
export function storeDirectory(env, namespace = CORE_NAMESPACE) {
  if (namespace !== null && (typeof namespace !== "string" || !PLAIN_NAME.test(namespace) || LAYOUT_NAME.test(namespace))) {
    throw new Error(`build-cache: store namespace ${JSON.stringify(namespace)} is not a plain directory name, or is one the store's own layout uses (tmp, v<n>)`);
  }
  const within = (dir) => (namespace === null ? dir : path.join(dir, namespace));
  const configured = env.FLUXIQ_BUILD_CACHE_DIR?.trim();
  if (configured !== undefined && configured !== "") {
    return configured.toLowerCase() === "off" ? null : within(path.resolve(configured));
  }
  if (env.LOCALAPPDATA) return within(path.join(env.LOCALAPPDATA, NAME));
  if (env.XDG_CACHE_HOME) return within(path.join(env.XDG_CACHE_HOME, NAME));
  return within(path.join(os.homedir(), ".cache", NAME));
}
