// Every TypeScript project in the repository (each audited tsconfig*.json),
// with `extends` followed inside the repository, for the package-exports rule:
// which files tsc checks, and where a package's build writes.
//
// `include`, `exclude`, `files` and `compilerOptions.outDir` come from the
// nearest config in the chain that sets them, and each resolves against the
// directory of the config that wrote it, as tsc resolves them. A config that
// extends a package by name contributes only its own fields. Read over ctx
// only; comments and trailing commas parse as tsc parses them.

import path from "node:path";

/**
 * @typedef {{ pattern: string, base: string }} ConfigPath a pattern as written, and the directory it resolves against
 * @typedef {{ file: string, include: ConfigPath[] | undefined, exclude: ConfigPath[] | undefined, files: ConfigPath[] | undefined, outDir: string | undefined }} Tsconfig
 *   `outDir` is POSIX and relative to this repository; every path is.
 */

const CONFIG = /(^|\/)tsconfig[^/]*\.json$/;
const FIELDS = ["include", "exclude", "files", "outDir"];

/**
 * @param {{ files: string[], read: (file: string) => string, ts: typeof import("typescript") }} ctx
 * @returns {Tsconfig[]}
 */
export function tsconfigs(ctx) {
  const present = new Set(ctx.files);
  const raw = new Map();
  const rawOf = (file) => {
    if (!raw.has(file)) raw.set(file, parse(ctx, file));
    return raw.get(file);
  };

  const resolve = (file, seen) => {
    const config = rawOf(file);
    const base = path.posix.dirname(file);
    const outDir = config.compilerOptions?.outDir;
    const own = {
      include: paths(config.include, base),
      exclude: paths(config.exclude, base),
      files: paths(config.files, base),
      outDir: typeof outDir === "string" ? path.posix.normalize(path.posix.join(base, outDir)) : undefined
    };
    const parents = (Array.isArray(config.extends) ? config.extends : [config.extends])
      .filter((target) => typeof target === "string" && (target.startsWith("./") || target.startsWith("../")))
      .map((target) => path.posix.normalize(path.posix.join(base, target.endsWith(".json") ? target : `${target}.json`)))
      .filter((target) => present.has(target) && !seen.has(target));
    // A later parent overrides an earlier one, and the config itself overrides both.
    const merged = {};
    for (const parent of parents) {
      const resolved = resolve(parent, new Set([...seen, parent]));
      for (const field of FIELDS) if (resolved[field] !== undefined) merged[field] = resolved[field];
    }
    for (const field of FIELDS) if (own[field] !== undefined) merged[field] = own[field];
    return merged;
  };

  return ctx.files.filter((file) => CONFIG.test(file)).map((file) => ({ file, ...resolve(file, new Set([file])) }));
}

function paths(value, base) {
  return Array.isArray(value) ? value.filter((pattern) => typeof pattern === "string").map((pattern) => ({ pattern, base })) : undefined;
}

function parse(ctx, file) {
  const { config, error } = ctx.ts.parseConfigFileTextToJson(file, ctx.read(file));
  if (error || config === null || typeof config !== "object" || Array.isArray(config)) {
    const why = error ? ctx.ts.flattenDiagnosticMessageText(error.messageText, "\n") : "not an object";
    throw new Error(`package-exports: ${file} cannot be parsed, so the files tsc checks and the directories builds write cannot be known: ${why}`);
  }
  return config;
}
