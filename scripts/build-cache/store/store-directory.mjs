// Where Core's part of the shared build store lives, or `null` when the store
// is switched off.
//
//   FLUXIQ_BUILD_CACHE_DIR=<dir>   use <dir>/core
//   FLUXIQ_BUILD_CACHE_DIR=off     no store: every step is stamped locally only
//   unset                          %LOCALAPPDATA%/fluxiq-build-cache/core on
//                                  Windows, $XDG_CACHE_HOME or ~/.cache elsewhere
//
// One store per user and machine, outside every checkout, so a worktree made
// today reuses what another worktree built yesterday. The downstream
// web-extension repository keeps its own entries at the top of the same
// directory; Core's live under `core/`, with their own format directory,
// temporary directory and pruning, so neither repository's entries or pruning
// can touch the other's.

import os from "node:os";
import path from "node:path";

const NAME = "fluxiq-build-cache";
const NAMESPACE = "core";

/** @param {NodeJS.ProcessEnv} env @returns {string | null} */
export function storeDirectory(env) {
  const configured = env.FLUXIQ_BUILD_CACHE_DIR?.trim();
  if (configured !== undefined && configured !== "") {
    return configured.toLowerCase() === "off" ? null : path.join(path.resolve(configured), NAMESPACE);
  }
  if (env.LOCALAPPDATA) return path.join(env.LOCALAPPDATA, NAME, NAMESPACE);
  if (env.XDG_CACHE_HOME) return path.join(env.XDG_CACHE_HOME, NAME, NAMESPACE);
  return path.join(os.homedir(), ".cache", NAME, NAMESPACE);
}
