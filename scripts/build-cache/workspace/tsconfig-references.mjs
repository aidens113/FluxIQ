// Every path a TypeScript project names -- `extends`, `include` and `files`
// (up to the first glob segment), `references`, `compilerOptions.paths`,
// `baseUrl`, `rootDir` and `typeRoots` -- for that config and every config it
// extends, as absolute paths. The registry test holds each against the step's
// input roots: a project that names a path outside them reads something no
// fingerprint covers. Excludes and output directories narrow what is read, so
// they are not listed.
//
// An `extends` naming a package rather than a relative path throws: it would
// read a file under node_modules this parser does not resolve, and a silent
// skip would pass a project whose base config was never checked.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { REPOSITORY_ROOT } from "../repository-root.mjs";

const GLOB = /[*?{}[\]]/u;

/**
 * @param {string} configPath absolute path of a tsconfig
 * @returns {{ config: string, field: string, value: string, path: string }[]}
 */
export function tsconfigReferences(configPath) {
  const ts = createRequire(path.join(REPOSITORY_ROOT, "package.json"))("typescript");
  const found = [];
  const seen = new Set();
  const pending = [path.resolve(configPath)];
  while (pending.length > 0) {
    const config = pending.pop();
    if (seen.has(config)) continue;
    seen.add(config);
    const parsed = ts.parseConfigFileTextToJson(config, readFileSync(config, "utf8"));
    if (parsed.error) throw new Error(`${config}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")}`);
    const json = parsed.config ?? {};
    const dir = path.dirname(config);
    const add = (field, value, base = dir) => found.push({ config, field, value, path: path.resolve(base, value) });

    for (const parent of [json.extends].flat().filter((value) => typeof value === "string")) {
      if (!parent.startsWith(".")) throw new Error(`${config}: extends "${parent}", a package, which tsconfig-references cannot resolve`);
      const target = parent.endsWith(".json") ? parent : `${parent}.json`;
      add("extends", target);
      pending.push(path.resolve(dir, target));
    }
    for (const pattern of json.include ?? []) add("include", staticPrefix(pattern));
    for (const file of json.files ?? []) add("files", file);
    for (const reference of json.references ?? []) add("references", reference.path);
    const options = json.compilerOptions ?? {};
    if (typeof options.baseUrl === "string") add("baseUrl", options.baseUrl);
    if (typeof options.rootDir === "string") add("rootDir", options.rootDir);
    for (const root of options.typeRoots ?? []) add("typeRoots", root);
    const pathsBase = typeof options.baseUrl === "string" ? path.resolve(dir, options.baseUrl) : dir;
    for (const targets of Object.values(options.paths ?? {})) for (const target of targets) add("paths", staticPrefix(target), pathsBase);
  }
  return found;
}

function staticPrefix(pattern) {
  const segments = pattern.split("/");
  const index = segments.findIndex((segment) => GLOB.test(segment));
  const kept = index === -1 ? segments : segments.slice(0, index);
  return kept.length === 0 ? "." : kept.join("/");
}
