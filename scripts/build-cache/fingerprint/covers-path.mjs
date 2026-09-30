// Whether a path lies inside one of a resolved step's input roots: at or under
// a root's path and not at or under one of its excluded paths. It asks where a
// path is, not whether git lists it, so the registry test can hold a tsconfig's
// `include` directory or `paths` target against the roots before any file
// exists there. `prove-inputs.mjs` asks the exact question, of listed files.

import path from "node:path";

/**
 * @param {string} target absolute path
 * @param {{ roots: { path: string, exclude?: string[] }[] }} resolved
 * @returns {boolean}
 */
export function coversPath(target, resolved) {
  const file = key(target);
  const inside = (base) => file === base || file.startsWith(`${base}${path.sep}`);
  return resolved.roots.some((root) => inside(key(root.path)) && !(root.exclude ?? []).some((excluded) => inside(key(excluded))));
}

function key(target) {
  const resolved = path.resolve(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
