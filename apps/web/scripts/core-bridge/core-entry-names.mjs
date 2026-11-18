// The names a built Core module exports, read from its text, following
// `export *` into the modules it re-exports.
//
// The bridge (`write-core-bridge.mjs`) re-exports each Core entry point by
// name rather than with `export *`. A browser or edge bundle that reaches
// Core through the bridge then follows only the names it uses: an `export *`
// made Turbopack compile everything an entry re-exports to learn its names
// (warning on `server/managed-hosts/load-launcher.js`) and kept more of it in
// the edge middleware (147 KB to 214 KB).
//
// Core's `dist` is TypeScript's output: one statement per line, type-only
// exports already erased. A form this reader cannot name exactly (a
// destructuring `export const { ... }`) is refused rather than guessed, since
// a missing name would break every bundle that imports it.
//
// Loaded by `next.config.ts`, which Next compiles to CommonJS: no top-level
// await, no `import.meta`.

import { readFileSync } from "node:fs";
import path from "node:path";

const DECLARED = /^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gmu;
const DESTRUCTURED = /^export\s+(?:const|let|var)\s+[[{]/mu;
const DEFAULT = /^export\s+default\b/mu;
const LISTED = /^export\s*\{([^}]*)\}\s*(?:from\s*(["'])([^"']+)\2)?/gmu;
const STAR_AS = /^export\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*(["'])([^"']+)\2/gmu;
const STAR = /^export\s*\*\s*from\s*(["'])([^"']+)\1/gmu;

/**
 * @param {string} file a built JavaScript module's absolute path
 * @param {Map<string, Set<string>>} [cache] names already read, by file
 * @returns {string[]} the names it exports, sorted (`default` included when it has one)
 */
export function coreEntryNames(file, cache = new Map()) {
  return [...namesOf(path.resolve(file), cache, [])].sort();
}

function namesOf(file, cache, chain) {
  const known = cache.get(file);
  if (known) return known;
  if (chain.includes(file)) throw new Error(`Core bridge: ${[...chain, file].join(" -> ")} re-export one another in a cycle.`);
  const code = readFileSync(file, "utf8");
  if (DESTRUCTURED.test(code)) throw new Error(`Core bridge: ${file} exports a destructured declaration, whose names this reader does not read.`);
  const names = new Set();
  for (const match of code.matchAll(DECLARED)) names.add(match[1]);
  if (DEFAULT.test(code)) names.add("default");
  for (const match of code.matchAll(LISTED)) {
    for (const part of match[1].split(",")) {
      const words = part.trim().split(/\s+as\s+/u);
      const name = (words[1] ?? words[0] ?? "").trim();
      if (name) names.add(name);
    }
  }
  for (const match of code.matchAll(STAR_AS)) names.add(match[1]);
  for (const match of code.matchAll(STAR)) {
    for (const name of namesOf(resolveModule(file, match[2]), cache, [...chain, file])) if (name !== "default") names.add(name);
  }
  cache.set(file, names);
  return names;
}

/** A specifier as Node resolves it for an ES import: relative, or a package's `import` export. */
function resolveModule(from, specifier) {
  if (specifier.startsWith(".")) return path.resolve(path.dirname(from), specifier);
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const rest = specifier.slice(name.length);
  const sub = rest ? `.${rest}` : ".";
  for (let directory = path.dirname(from); ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, "node_modules", name);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path.join(candidate, "package.json"), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      if (path.dirname(directory) === directory) throw new Error(`Core bridge: ${from} re-exports ${specifier}, which does not resolve.`);
      continue;
    }
    const entry = manifest.exports?.[sub] ?? (sub === "." ? manifest.exports : undefined);
    const target = typeof entry === "string" ? entry : entry?.import ?? entry?.default ?? (sub === "." ? manifest.module ?? manifest.main : undefined);
    if (typeof target !== "string") throw new Error(`Core bridge: ${from} re-exports ${specifier}, which ${name}'s package.json does not export for import.`);
    return path.join(candidate, target);
  }
}
