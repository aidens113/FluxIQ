// Every package this repository links: its workspace packages (each audited
// package.json) and the packages a workspace manifest links from outside the
// repository with a `link:` or `file:` dependency, such as the downstream
// repository's link to FluxIQ Core. Read over ctx only: a linked package's
// manifest is read through ctx.read at its path relative to this repository.
//
// The repository root's own manifest is a package too -- its scripts belong to
// it -- but it never shadows a workspace package of the same name: Core's root
// and `packages/fluxiq` are both named "fluxiq", and only the second is what
// an import of "fluxiq" loads.

import path from "node:path";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const LINK = /^(link|file):/;

/**
 * @typedef {{ name: string, directory: string, manifest: Record<string, any>, external: boolean, ownRepositoryPath: string }} LinkedPackage
 *   `directory` is POSIX and relative to this repository (it starts with `../`
 *   when the package is outside it); `ownRepositoryPath` is where the package
 *   sits inside its own repository, which is how a path built from that
 *   repository's root names it.
 */

/**
 * @param {{ files: string[], read: (file: string) => string }} ctx
 * @returns {LinkedPackage[]} root package last, so a lookup by directory prefers the narrower package
 */
export function linkedPackages(ctx) {
  const byName = new Map();
  const add = (entry) => {
    const existing = byName.get(entry.name);
    if (existing && existing.directory !== "." && entry.directory === ".") return;
    byName.set(entry.name, entry);
  };

  const workspace = [];
  for (const file of ctx.files) {
    if (path.posix.basename(file) !== "package.json") continue;
    const manifest = parseManifest(ctx, file);
    const directory = path.posix.dirname(file);
    workspace.push({ directory, manifest });
    if (typeof manifest.name === "string") add({ name: manifest.name, directory, manifest, external: false, ownRepositoryPath: directory });
  }

  for (const { directory, manifest } of workspace) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (typeof version !== "string" || !LINK.test(version)) continue;
        const target = path.posix.normalize(path.posix.join(directory, version.replace(LINK, "")));
        if (byName.has(name) && byName.get(name).directory !== ".") continue;
        const linked = parseManifest(ctx, `${target}/package.json`, `${directory}/package.json links "${name}" to ${version}`);
        add({ name, directory: target, manifest: linked, external: target.startsWith("../"), ownRepositoryPath: ownRepositoryPath(target) });
      }
    }
  }

  return [...byName.values()].sort((a, b) => b.directory.length - a.directory.length);
}

// `../!FluxIQ/packages/fluxiq` sits at `packages/fluxiq` in its own checkout:
// drop the climb out of this repository and the sibling checkout's own name.
function ownRepositoryPath(directory) {
  const segments = directory.split("/");
  let first = 0;
  while (segments[first] === "..") first += 1;
  return first === 0 ? directory : segments.slice(first + 1).join("/");
}

function parseManifest(ctx, file, why) {
  let text;
  try {
    text = ctx.read(file);
  } catch (error) {
    throw new Error(`package-exports: cannot read ${file}${why ? ` (${why})` : ""}, so the imports of that package cannot be checked against its exports: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`package-exports: ${file} is not valid JSON, so its exports cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}
