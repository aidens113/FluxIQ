import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as nodes from "../index.ts";

const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const canonicalDirectories = [
  "components/automation",
  "runtime/interaction",
  "runtime/action-permissions",
  "flows/executable/validation"
];

async function productionSources(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "tests") files.push(...await productionSources(file));
    } else if (entry.name.endsWith(".ts")) {
      files.push(file);
    }
  }
  return files;
}

function importsIn(source: string, file: string): string[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specifiers.push(node.argument.literal.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return specifiers;
}

describe("framework automation node ownership", () => {
  it("names its canonical source root", () => {
    expect(nodes.automationStudioSourceNodeRoot).toBe("packages/fluxiq/src/components/automation");
  });

  it("closes every canonical source dependency without importing Studio, including erased types", async () => {
    const pending = (await Promise.all(canonicalDirectories.map((directory) => productionSources(path.join(sourceRoot, directory))))).flat();
    pending.push(path.join(sourceRoot, "flows/executable/scope.ts"));
    const visited = new Set<string>();
    const offenders: string[] = [];
    while (pending.length) {
      const file = pending.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const relativeFile = path.relative(sourceRoot, file).replaceAll("\\", "/");
      if (relativeFile.startsWith("programs/automation-studio/")) {
        offenders.push(relativeFile);
        continue;
      }
      for (const specifier of importsIn(await readFile(file, "utf8"), file)) {
        if (specifier.startsWith(".")) pending.push(path.resolve(path.dirname(file), specifier));
      }
    }
    expect(offenders).toEqual([]);
    expect(visited.size).toBeGreaterThan(100);
  });
});
