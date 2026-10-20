// Whether a cache root runs through a `node_modules` directory, where the web
// panel cannot be built at all.
//
// Turbopack treats a project whose own path runs through `node_modules` as
// third-party code, and its build worker aborts in the first seconds with
// exit 3221225501 (0xC000001D) and nothing else in its log. Measured with
// everything else held fixed: a cache at `F:\t013ab\node_modules\cwb` crashed
// twice, identically, in 4-5 s; `F:\t013ab\plain_modules\cwb`, the same
// length, built in 48 s. This turns that exit code into a sentence.

import path from "node:path";

/** @param {string} cacheRoot @returns {boolean} */
export function insideNodeModules(cacheRoot) {
  // Separators by name, not by regex: both kinds, whatever platform wrote the path.
  return path
    .resolve(cacheRoot)
    .replaceAll(path.win32.sep, path.posix.sep)
    .split(path.posix.sep)
    .some((segment) => segment.toLowerCase() === "node_modules");
}
