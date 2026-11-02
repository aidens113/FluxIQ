import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const contractsRoot = fileURLToPath(new URL("../../../../../contracts/src/", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function sources(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sources(file));
    if (entry.isFile() && entry.name.endsWith(".ts")) files.push(file);
  }
  return files;
}

it("closes state and recording sources and tests without reaching Studio, including erased imports", async () => {
  const pending = (await Promise.all(["runtime/state", "runtime/recording"].map((directory) => sources(path.join(sourceRoot, directory))))).flat();
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
  expect(seen.size).toBeGreaterThan(60);
});

it("keeps domain target keys out of canonical contract declarations", async () => {
  const directories = ["state", "recording", "evidence", "runtime/actions"];
  const files = (await Promise.all(directories.map(directory => sources(path.join(contractsRoot, directory))))).flat();
  const domainKeys = new Set(["selector", "xpath", "tagName", "url", "classNames", "accessibleName", "ariaLabel", "implicitRole"]);
  const found: string[] = [];
  for (const file of files) {
    const ast = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isPropertySignature(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && domainKeys.has(node.name.text)) found.push(`${path.relative(contractsRoot, file)}:${node.name.text}`);
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  expect(found).toEqual([]);
});
