import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps the actual legacy browser client source and erased-import closure free of Node and instruction runtime", () => {
  const pending = [fileURLToPath(new URL("../index.ts", import.meta.url))];
  const seen = new Set<string>(), refused: string[] = [];
  const nodeBuiltins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
  const options: ts.CompilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (seen.size > 1000) throw new Error("Browser client dependency closure exceeded its bounded traversal.");
    const normalized = file.replaceAll("\\", "/");
    if (normalized.includes("/runtime/action-permissions/instruction/")) refused.push(`instruction runtime: ${normalized}`);
    for (const imported of ts.preProcessFile(readFileSync(file, "utf8"), true, true).importedFiles) {
      const specifier = imported.fileName;
      if (specifier.startsWith("node:") || nodeBuiltins.has(specifier)) {
        refused.push(`${specifier} from ${normalized}`);
        continue;
      }
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
      if (!resolved) {
        if (specifier.startsWith(".") || specifier.startsWith("@fluxiq/contracts/")) refused.push(`unresolved ${specifier} from ${normalized}`);
        continue;
      }
      const target = path.resolve(resolved.resolvedFileName);
      const local = target.replaceAll("\\", "/");
      if (local.includes("/packages/fluxiq/") || local.includes("/packages/contracts/")) pending.push(target);
    }
  }
  expect(refused).toEqual([]);
});
