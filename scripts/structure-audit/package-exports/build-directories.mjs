// Where one workspace package's build writes, relative to the package: `dist/`
// always; the `outDir` of each tsconfig the package holds; and the top
// directory of every built JavaScript or declaration file its manifest names
// (`exports`, `main`, `module`, `types`, `typings`, `bin`), other than `src/`.
// That is what the package-exports rule counts as another package's build
// output.

import path from "node:path";

const BUILT = /\.(m?js|cjs|d\.[cm]?ts)$/;
const MANIFEST_FIELDS = ["main", "module", "types", "typings", "bin"];

/**
 * @param {{ directory: string, manifest: Record<string, any> }} entry the package, its directory relative to this repository
 * @param {import("./tsconfigs.mjs").Tsconfig[]} configs
 * @returns {string[]} directories relative to the package, without a trailing slash
 */
export function buildDirectories(entry, configs) {
  const found = new Set(["dist"]);
  for (const config of configs) {
    if (path.posix.dirname(config.file) !== entry.directory || !config.outDir) continue;
    const inside = path.posix.relative(entry.directory, config.outDir);
    if (inside !== "" && !inside.startsWith("..")) found.add(inside);
  }
  const targets = [];
  const collect = (value) => {
    if (typeof value === "string") targets.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(entry.manifest.exports);
  for (const field of MANIFEST_FIELDS) collect(entry.manifest[field]);
  for (const target of targets) {
    if (!BUILT.test(target)) continue;
    const segments = path.posix.normalize(target).split("/");
    if (segments.length > 1 && segments[0] !== "src" && segments[0] !== "..") found.add(segments[0]);
  }
  return [...found];
}
