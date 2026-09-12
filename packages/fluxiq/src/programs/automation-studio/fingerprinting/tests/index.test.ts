// What `fluxiq/automation-studio/fingerprinting` promises, and the promise a
// machine has to keep.
//
// The subpath exists so a browser host -- a content script, a worker, anything
// without a Node runtime -- can score element candidates with the same matcher
// the framework scores them with, instead of writing a second one that drifts.
// That is only true while the module graph behind the barrel stays free of
// runtime imports: the top-level `fluxiq/automation-studio` barrel reaches
// `node:crypto` and `node:perf_hooks` through `dsl/` and `testing/`, and a
// browser bundler reports those as resolution errors before tree-shaking can
// drop them.
//
// So the guarantee is checked here rather than written down. A value import
// added to any module in this closure fails this test, which is the only thing
// that stops the subpath quietly becoming Node-only again.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fingerprintingDir = path.resolve(testsDir, "..");
const packageRoot = path.resolve(testsDir, "..", "..", "..", "..", "..");
const subpath = "./automation-studio/fingerprinting";

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
      types: "./dist/programs/automation-studio/fingerprinting/index.d.ts",
      import: "./dist/programs/automation-studio/fingerprinting/index.js"
    });
  });

  it("reaches no runtime import outside its own directory, so a browser can bundle it", async () => {
    const closure = await runtimeClosure(path.join(fingerprintingDir, "index.ts"));
    const escaping = closure.filter((file) => path.relative(fingerprintingDir, file).startsWith(".."));
    expect(escaping).toEqual([]);
  });

  it("imports every module outside its directory as a type, and no Node built-in at all", async () => {
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
