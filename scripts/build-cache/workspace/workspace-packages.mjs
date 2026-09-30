// The packages of one pnpm workspace, read from its `pnpm-workspace.yaml` and
// each package's `package.json`: name, directory, the workspace packages it
// depends on and the directories it links with `link:`.
//
// Only a trailing "/*" ("apps/*", "packages/*") or a plain directory is
// understood. Anything else throws rather than
// silently reading a smaller workspace, because a package missing from the
// graph is a dependency missing from every fingerprint that should cover it.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PATTERN_LINE = /^\s*-\s*["']?([^"'#]+?)["']?\s*$/u;

/**
 * @param {string} workspaceRoot
 * @returns {Map<string, { name: string, dir: string, workspaceDeps: string[], links: string[] }>}
 */
export function readWorkspacePackages(workspaceRoot) {
  const manifest = path.join(workspaceRoot, "pnpm-workspace.yaml");
  const patterns = readFileSync(manifest, "utf8")
    .split(/\r?\n/u)
    .map((line) => PATTERN_LINE.exec(line)?.[1])
    .filter((pattern) => pattern !== undefined);
  if (patterns.length === 0) throw new Error(`${manifest} lists no workspace packages`);

  const packages = new Map();
  for (const dir of patterns.flatMap((pattern) => expand(workspaceRoot, pattern, manifest))) {
    const manifestPath = path.join(dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const json = JSON.parse(readFileSync(manifestPath, "utf8"));
    const specs = { ...json.dependencies, ...json.devDependencies, ...json.peerDependencies };
    const workspaceDeps = [];
    const links = [];
    for (const [name, spec] of Object.entries(specs)) {
      if (typeof spec !== "string") continue;
      if (spec.startsWith("workspace:")) workspaceDeps.push(name);
      else if (spec.startsWith("link:")) links.push(path.resolve(dir, spec.slice("link:".length)));
    }
    packages.set(json.name, { name: json.name, dir, workspaceDeps: workspaceDeps.sort(), links: links.sort() });
  }
  return packages;
}

function expand(workspaceRoot, pattern, manifest) {
  const segments = pattern.split("/");
  if (segments.some((segment, index) => segment.includes("*") && (segment !== "*" || index !== segments.length - 1))) {
    throw new Error(`${manifest}: workspace pattern "${pattern}" is not supported; only a trailing "/*" or a plain directory is`);
  }
  if (segments.at(-1) !== "*") return [path.join(workspaceRoot, ...segments)];
  const parent = path.join(workspaceRoot, ...segments.slice(0, -1));
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name))
    .sort();
}
