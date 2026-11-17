// Where a relative or `@/` specifier leads among the audited scripts. A
// package specifier (a workspace package or node_modules) is not followed.

import path from "node:path";

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx"];
const SOURCE_FOR = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"] };

/**
 * @param {Set<string>} fileSet audited script paths
 * @param {string} importer
 * @param {string} specifier
 * @param {string} src the app's source root, ending in `/`, which `@/` names
 * @returns {string | null} the script it loads, or null when it names none that is followed
 */
export function resolveLocal(fileSet, importer, specifier, src) {
  let base;
  if (specifier.startsWith("./") || specifier.startsWith("../")) base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  else if (specifier.startsWith("@/")) base = path.posix.join(src, specifier.slice(2));
  else return null;
  const extension = path.posix.extname(base);
  const stem = base.slice(0, base.length - extension.length);
  const candidates = [
    base,
    ...(SOURCE_FOR[extension] ?? []).map((source) => stem + source),
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => `${base}/index${ext}`)
  ];
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}
