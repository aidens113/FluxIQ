// Every way a directory's absolute path is commonly written into a file:
// backslashes and forward slashes, either drive-letter case, JSON-escaped
// backslashes, and `file://` URLs (plain and percent-encoded). An output that
// holds any of them names the tree it was built in and would point back at
// that tree after being copied into another one.
//
// Spellings are lower-cased, and `findEmbeddedPath` compares against the
// lower-cased file, so the drive letter and every other segment match in any
// case -- TypeScript's build info, for one, writes Windows paths lower-cased.

import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @param {string[]} directories absolute paths
 * @returns {string[]} lower-cased spellings, longest first, without duplicates
 */
export function pathSpellings(directories) {
  const found = new Set();
  for (const directory of directories) {
    const resolved = path.resolve(directory);
    const forward = resolved.split(path.sep).join("/");
    const backward = forward.split("/").join("\\");
    found.add(forward);
    found.add(backward);
    found.add(backward.split("\\").join("\\\\"));
    found.add(forward.split("/").join("\\/"));
    const url = pathToFileURL(resolved).href;
    found.add(url);
    found.add(decodeURI(url));
    found.add(`file://${forward.startsWith("/") ? "" : "/"}${forward}`);
  }
  return [...new Set([...found].map((spelling) => spelling.toLowerCase()))].sort((left, right) => right.length - left.length);
}
