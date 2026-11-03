// The legacy public subpath remains browser safe while forwarding generic
// matching to its framework owner. Concrete web scoring is supplied by domains.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fingerprintingDir = path.resolve(testsDir, "..");
const packageRoot = path.resolve(testsDir, "..", "..", "..", "..", "..");
const subpath = "./automation/fingerprinting";

/** One `import`/`export ... from` statement, and whether TypeScript erases it. */
type ModuleReference = {
  specifier: string;
  typeOnly: boolean;
};

describe("the fingerprinting subpath", () => {
  it("is published from the package manifest and points at this barrel", async () => {
    const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(manifest.exports[subpath]).toEqual({
      types: "./dist/runtime/target-matching/fingerprinting/index.d.ts",
      import: "./dist/runtime/target-matching/fingerprinting/index.js"
    });
  });

  it("reaches only the neutral matching owner outside its compatibility directory", async () => {
    const closure = await runtimeClosure(path.join(fingerprintingDir, "index.ts"));
    const canonical = path.resolve(packageRoot, "src/runtime/target-matching");
    const escaping = closure.filter((file) => path.relative(fingerprintingDir, file).startsWith("..") && path.relative(canonical, file).startsWith(".."));
    expect(escaping).toEqual([]);
  });

  it("has no Node or external runtime imports in its browser-safe closure", async () => {
    const closure = await runtimeClosure(path.join(fingerprintingDir, "index.ts"));
    const offenders: string[] = [];
    for (const file of closure) {
      for (const reference of moduleReferences(await readFile(file, "utf8"))) {
        const relative = path.relative(packageRoot, file).replaceAll("\\", "/");
        if (reference.specifier.startsWith("node:")) offenders.push(`${relative} imports ${reference.specifier}`);
        else if (!reference.specifier.startsWith(".") && !reference.typeOnly) {
          offenders.push(`${relative} has a runtime import of ${reference.specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** Every module that survives type erasure, reachable from `entry` by a value import. */
async function runtimeClosure(entry: string): Promise<string[]> {
  const visited = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    for (const reference of moduleReferences(await readFile(file, "utf8"))) {
      if (reference.typeOnly || !reference.specifier.startsWith(".")) continue;
      queue.push(resolveRelative(path.dirname(file), reference.specifier));
    }
  }
  return [...visited].sort();
}

/**
 * The modules a source file names. `import type` and `export type` are erased
 * by the compiler and so cannot reach a bundler; everything else is a runtime
 * edge, including a bare `import "./side-effect.ts"` and an `export * from`.
 */
function moduleReferences(source: string): ModuleReference[] {
  const references: ModuleReference[] = [];
  for (const match of source.matchAll(/(?:^|\n)\s*(import|export)\s+([^;]*?)\bfrom\s*["']([^"']+)["']/g)) {
    references.push({ specifier: match[3] ?? "", typeOnly: /^type\b/.test(match[2] ?? "") });
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) {
    references.push({ specifier: match[1] ?? "", typeOnly: false });
  }
  return references;
}

/** A relative TypeScript specifier as a file path, resolving a directory to its barrel. */
function resolveRelative(fromDir: string, specifier: string): string {
  const resolved = path.resolve(fromDir, specifier);
  return resolved.endsWith(".ts") ? resolved : path.join(resolved, "index.ts");
}
