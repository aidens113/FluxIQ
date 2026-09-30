// Where one specifier in a browser-reachable file leads, as the bundler would
// see it, answered over the audited file list only (no filesystem, no git).
//
// A relative specifier resolves to a source file: `./x.js` is the `./x.ts` it
// was compiled from, and a bare directory is its index. A package specifier is
// a Node built-in, a package owned elsewhere (another repository's own audit
// holds it), a workspace package of this repository (followed into its
// source, through its `exports`, with `dist/` read as `src/`), a third-party
// package declared browser-safe, or an undeclared package. Anything else
// cannot be followed, and says so rather than ending the walk quietly.

import { builtinModules } from "node:module";
import path from "node:path";

const NODE_BUILTINS = new Set(builtinModules.filter((name) => !name.startsWith("_")));
const SCRIPT = [".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx"];
const COMPILED = new Set([".js", ".mjs", ".cjs", ".jsx"]);
const ASSETS = new Set([".css", ".json", ".svg", ".png", ".html", ".txt", ".woff2"]);
const SOURCE_FOR = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };

/**
 * @typedef {{ kind: "file", file: string }
 *   | { kind: "builtin", name: string }
 *   | { kind: "owned-elsewhere" }
 *   | { kind: "asset" }
 *   | { kind: "browser-package", name: string }
 *   | { kind: "undeclared-package", name: string }
 *   | { kind: "unresolved", why: string }} Resolution
 */

/**
 * @param {{ files: string[], read: (file: string) => string }} ctx the audited paths, POSIX and repository-relative
 * @returns {Map<string, { directory: string, manifest: Record<string, any> }>} workspace packages by name
 */
export function workspacePackages(ctx) {
  const packages = new Map();
  for (const file of ctx.files) {
    if (path.posix.basename(file) !== "package.json") continue;
    let manifest;
    try {
      manifest = JSON.parse(ctx.read(file));
    } catch (error) {
      throw new Error(`browser-imports: ${file} is not valid JSON, so its package cannot be followed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof manifest.name === "string") packages.set(manifest.name, { directory: path.posix.dirname(file), manifest });
  }
  return packages;
}

/**
 * @param {{ fileSet: Set<string>, packages: ReturnType<typeof workspacePackages>, config: Record<string, any> }} graph
 * @param {string} importer
 * @param {string} specifier
 * @returns {Resolution}
 */
export function resolveSpecifier(graph, importer, specifier) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return sourceFile(graph.fileSet, path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier)), specifier);
  }
  if (specifier.startsWith("node:")) return { kind: "builtin", name: specifier };
  const segments = specifier.split("/");
  const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  const subpath = specifier.slice(name.length);
  if (NODE_BUILTINS.has(name)) return { kind: "builtin", name: specifier };
  if ((graph.config.ownedElsewhere ?? []).some((entry) => entry.pattern.test(specifier))) return { kind: "owned-elsewhere" };
  const workspace = graph.packages.get(name);
  if (workspace) return workspaceFile(graph.fileSet, workspace, subpath, specifier);
  if ((graph.config.browserPackages ?? []).includes(name)) return { kind: "browser-package", name };
  return { kind: "undeclared-package", name };
}

function workspaceFile(fileSet, workspace, subpath, specifier) {
  const key = subpath === "" ? "." : `.${subpath}`;
  const { exports, main } = workspace.manifest;
  let target = typeof exports === "string" && key === "." ? exports : exports?.[key];
  if (target === undefined && exports === undefined && key === ".") target = main;
  if (target && typeof target === "object") target = target.import ?? target.browser ?? target.default;
  if (typeof target !== "string") {
    return { kind: "unresolved", why: `package ${workspace.manifest.name} (${workspace.directory}/package.json) exports no "${key}" a browser import can load` };
  }
  const relative = target.replace(/^\.\//, "");
  const source = relative.startsWith("dist/") ? `src/${relative.slice("dist/".length)}` : relative;
  return sourceFile(fileSet, path.posix.join(workspace.directory, source), specifier);
}

function sourceFile(fileSet, base, specifier) {
  const extension = path.posix.extname(base);
  let candidates;
  if (COMPILED.has(extension)) {
    const stem = base.slice(0, -extension.length);
    candidates = [...SOURCE_FOR[extension].map((source) => stem + source), base];
  } else if (SCRIPT.includes(extension)) {
    candidates = [base];
  } else if (ASSETS.has(extension)) {
    // A stylesheet, JSON document or image: bundled as data, never as code
    // that could reach Node.
    return { kind: "asset" };
  } else {
    candidates = [...SCRIPT.map((ext) => base + ext), ...SCRIPT.map((ext) => `${base}/index${ext}`)];
  }
  const file = candidates.find((candidate) => fileSet.has(candidate));
  return file ? { kind: "file", file } : { kind: "unresolved", why: `"${specifier}" names no audited source file (looked for ${candidates[0]})` };
}
