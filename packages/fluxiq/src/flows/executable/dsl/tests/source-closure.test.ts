import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

// Reads synchronously on purpose. The walk is 191 files and about 0.7 s of CPU, and an
// awaited readFile is four thread-pool hand-offs per file (open, stat, read, close), each
// waiting its turn on a busy machine: the same walk measured 0.4 s to 8.7 s, nearly all of
// it in those reads, and ran past 15 s in the sweep of 2026-11-04. Read in one go, the reads
// cost 50-80 ms under the same load (t868).
it("the complete declarative compiler graph is independent of Studio, including type imports", () => {
  const pending = [fileURLToPath(new URL("../index.ts", import.meta.url))];
  const visited = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    expect(file.replaceAll("\\", "/")).not.toContain("/programs/automation-studio/");
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      expect(specifier.text, file).not.toContain("@fluxiq/contracts/automation");
      if (specifier.text.startsWith(".")) {
        const target = path.resolve(path.dirname(file), specifier.text);
        pending.push(target.endsWith(".ts") ? target : path.join(target, "index.ts"));
      }
    }
  }
  expect(visited.size).toBeGreaterThan(10);
});
