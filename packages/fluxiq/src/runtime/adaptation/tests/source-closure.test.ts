import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const contractsRoot = fileURLToPath(new URL("../../../../../contracts/src/", import.meta.url));

it("closes exploration, deadline and failure-code value and erased-type imports without Studio", async () => {
  const pending = ["runtime/adaptation/exploration/index.ts", "runtime/adaptation/deadline/index.ts", "runtime/agents/loop/index.ts"].map(file => path.join(sourceRoot, file));
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
      let target: string | undefined;
      if (specifier.startsWith(".")) target = path.resolve(path.dirname(file), specifier);
      else if (specifier === "@fluxiq/contracts") target = path.join(contractsRoot, "index.ts");
      else if (specifier.startsWith("@fluxiq/contracts/")) target = path.join(contractsRoot, `${specifier.slice("@fluxiq/contracts/".length)}.ts`);
      if (target) pending.push(target.replace(/\.js$/u, ".ts"));
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
  expect(seen.size).toBeGreaterThan(35);
});
