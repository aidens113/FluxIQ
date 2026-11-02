import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function sources(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "tests") files.push(...await sources(file));
    if (entry.isFile() && entry.name.endsWith(".ts")) files.push(file);
  }
  return files;
}

it("closes all model and agent source dependencies without reaching Studio, including erased type imports", async () => {
  const pending = (await Promise.all(["runtime/models", "runtime/agents"].map((directory) => sources(path.join(sourceRoot, directory))))).flat();
  const seen = new Set<string>();
  const forbidden: string[] = [];
  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
    if (relative.startsWith("programs/automation-studio/")) {
      forbidden.push(relative);
      continue;
    }
    const ast = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    const record = (specifier: string): void => {
      if (specifier.startsWith(".")) pending.push(path.resolve(path.dirname(file), specifier));
    };
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) record(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) record(node.argument.literal.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) record(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  expect(forbidden).toEqual([]);
  expect(seen.size).toBeGreaterThan(70);
});
