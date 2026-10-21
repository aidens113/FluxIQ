// Where a path written in a load lands, when it lands inside another package
// rather than going through the package's name.
//
// A relative path resolves against the importing file. Any other path is read
// from a repository root: this repository's, or, for a package linked from
// outside it, that package's own repository's, which is how
// `path.join(coreRoot, "packages/fluxiq/dist/...")` names Core's build from
// downstream. A package may load its own files; the root package is never the
// target, since its directory holds every other.
//
// What comes back says which part of the package the path enters:
//   "outside" anywhere in a package linked from outside this repository
//   "build"   one of a workspace package's build directories
//             (`builds`, from ./build-directories.mjs)
//   "source"  a workspace package's `src/`
// A path into any other part of a workspace package is not reported.

import path from "node:path";

/**
 * @typedef {import("./linked-packages.mjs").LinkedPackage & { builds: string[] }} BuiltPackage
 */

/**
 * @param {BuiltPackage[]} packages longest directory first
 * @param {string} importer
 * @returns {BuiltPackage | undefined}
 */
function owningPackage(packages, importer) {
  return packages.find((entry) => !entry.external && (entry.directory === "." || importer.startsWith(`${entry.directory}/`)));
}

const within = (rest, directory) => rest === directory || rest.startsWith(`${directory}/`);

/**
 * @param {BuiltPackage[]} packages longest directory first
 * @param {string} importer
 * @param {string} text the path as written
 * @returns {{ entry: BuiltPackage, rest: string, area: "outside" | "build" | "source" } | null} the package entered, the path inside it, and which part
 */
export function packagePathTarget(packages, importer, text) {
  const relative = text.startsWith("./") || text.startsWith("../");
  const written = relative ? path.posix.normalize(path.posix.join(path.posix.dirname(importer), text)) : text.replace(/^\/+/, "");
  const owner = owningPackage(packages, importer);
  for (const entry of packages) {
    if (entry.directory === "." || entry === owner) continue;
    const prefixes = relative ? [entry.directory] : [entry.directory, entry.ownRepositoryPath];
    for (const prefix of prefixes) {
      if (!written.startsWith(`${prefix}/`)) continue;
      const rest = written.slice(prefix.length + 1);
      if (entry.external) return { entry, rest, area: "outside" };
      if (entry.builds.some((directory) => within(rest, directory))) return { entry, rest, area: "build" };
      if (within(rest, "src")) return { entry, rest, area: "source" };
    }
  }
  return null;
}
