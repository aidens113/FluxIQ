// The Next executable of a Core checkout's own installation: what builds a
// staged attempt, and what serves it with `next start`.

import path from "node:path";

/** @param {string} repoRoot @param {string} [platform] @returns {string} */
export function nextExecutable(repoRoot, platform = process.platform) {
  return path.join(repoRoot, "apps", "web", "node_modules", ".bin", platform === "win32" ? "next.cmd" : "next");
}
