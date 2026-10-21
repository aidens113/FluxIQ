// A package is loaded only through what its manifest exports, where nothing
// else checks the load.
//
// Why. A package's `exports` is its public surface: what it keeps compatible,
// what its own tests and audits hold to, and what a consumer can rely on after
// the package is rebuilt or restructured. A load of anything else depends on
// the package's private layout, and the first sign of a moved file is a run
// that fails to load it -- unless a check covers the load. In October 2026 the
// downstream test runner loaded half a dozen Core modules by addresses built
// beside Core's entry, because Core did not export them; no check saw it.
//
// What is held, counted per file and ratcheted:
//   1. A package linked from outside the repository (a `link:`/`file:`
//      dependency on another checkout, as downstream links Core's `fluxiq`):
//      every load by a path its exports do not name -- a bare subpath its map
//      leaves out, or any path into its directory, by relative path or from its
//      own repository's root, static import or not. This repository's type
//      check does not follow such a path into the other checkout's layout.
//   2. Any linked package: a module address computed beside its entry,
//      `new URL(<path>, import.meta.resolve("<package>"))` or a load whose
//      argument combines `import.meta.resolve("<package>")` with another path.
//      The address is a string at run time; no type check sees it.
//   3. Within the repository, a load of another workspace package's build
//      output: `dist/`, or any directory its build writes (a tsconfig
//      `outDir`, or the directory of a built file its manifest names;
//      ../package-exports/build-directories.mjs). Build output can be stale or
//      absent, and the type check reads the source, not the build.
//   Also, as the same surface seen from a bare specifier: a
//   `<package>/<subpath>` the package's exports do not name, for any linked
//   package; and a load of another workspace package's `src/` that tsc does
//   not check (a dynamic import, a require, or any load from JavaScript or
//   from a file no tsconfig takes in).
//
// What is not held: a static `import`/`export ... from` declaration of a
// sibling workspace package's TypeScript source by relative path, from a file
// a tsconfig of this repository takes in (../package-exports/
// type-checked-files.mjs). tsc resolves and checks that dependency, so a moved
// or changed file fails the type check, and this repository's e2e harnesses
// share test-runner code that way. A package with no `exports` field, and a
// third-party package, are not held either.
//
// What is read. Each audited script's import and load expressions
// (../package-exports/load-sites.mjs), never any other string: tooling that
// names a build path to check its freshness, without loading it, passes. The
// packages are the ones this repository links (../package-exports/
// linked-packages.mjs): its workspace packages, and those a workspace manifest
// links from outside the repository, read from their own manifests. The
// remedy is the package's: export what consumers need, then import it by name.

import { buildDirectories, isExportedSubpath, linkedPackages, loadSites, packagePathTarget, tsconfigs, typeCheckedFiles } from "../package-exports/index.mjs";

export const id = "package-exports";
export const title = "Linked packages are loaded only through the subpaths their exports name";

const SHOWN = 4;
const setupFor = new WeakMap();

export function run(ctx) {
  if (!setupFor.has(ctx)) setupFor.set(ctx, setup(ctx));
  const { packages, checked } = setupFor.get(ctx);
  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  const findings = [];

  for (const file of ctx.scriptFiles) {
    const problems = [];
    for (const site of loadSites(ctx, file)) {
      const problem = problemOf(packages, byName, checked, file, site);
      if (problem !== null) problems.push({ line: site.line, text: `line ${site.line}: ${problem}` });
    }
    if (problems.length === 0) continue;
    const shown = problems.slice(0, SHOWN).map((problem) => problem.text).join("\n    ");
    const more = problems.length > SHOWN ? `\n    ...and ${problems.length - SHOWN} more.` : "";
    findings.push({
      key: file, value: problems.length, limit: 0, path: file, line: problems[0].line,
      message: `${file}: ${problems.length} load(s) of a linked package's private files, which its exports do not name:\n    ${shown}${more}\n  A package's exports are its public surface; anything else can move with no check failing until a run cannot load it. Export what you need from the package and import it by name.`,
      severity: "fail", ratchet: true
    });
  }

  return findings;
}

function setup(ctx) {
  const configs = tsconfigs(ctx);
  const packages = linkedPackages(ctx).map((entry) => ({ ...entry, builds: entry.external ? [] : buildDirectories(entry, configs) }));
  return { packages, checked: typeCheckedFiles(ctx.scriptFiles, configs) };
}

function problemOf(packages, byName, checked, file, site) {
  if (site.kind === "beside-entry") {
    const entry = byName.get(packageName(site.text));
    return entry ? `builds a module address beside the entry of "${site.text}" (${entry.directory}), reaching files its exports do not name` : null;
  }
  const relative = site.text.startsWith("./") || site.text.startsWith("../");
  if (site.kind === "path-literal" || relative) {
    const target = packagePathTarget(packages, file, site.text);
    if (target === null) return null;
    const { entry, rest, area } = target;
    const where = `${entry.directory}/${rest}`;
    if (area === "outside") return `loads "${site.text}", a path into ${entry.name} (${where}), which is linked from outside this repository and exports no such path`;
    if (area === "build") return `loads "${site.text}", ${entry.name}'s build output (${where}), which the type check does not read and a build may leave stale or absent`;
    if (site.declaration && checked.has(file)) return null;
    return `loads "${site.text}", ${entry.name}'s source (${where}), by a load tsc does not check; a static import from a file a tsconfig takes in would be checked`;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(site.text) || site.text.startsWith("/")) return null;
  const name = packageName(site.text);
  const entry = byName.get(name);
  if (!entry) return null;
  const subpath = site.text.slice(name.length);
  return isExportedSubpath(entry.manifest, subpath) ? null : `loads "${site.text}", but ${entry.directory}/package.json exports no ".${subpath}"`;
}

function packageName(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}
