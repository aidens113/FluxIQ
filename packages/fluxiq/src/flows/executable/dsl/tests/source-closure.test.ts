import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("the complete declarative compiler graph is independent of Studio, including type imports", async () => {
  const pending = [fileURLToPath(new URL("../index.ts", import.meta.url))];
  const visited = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    expect(file.replaceAll("\\", "/")).not.toContain("/programs/automation-studio/");
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
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
