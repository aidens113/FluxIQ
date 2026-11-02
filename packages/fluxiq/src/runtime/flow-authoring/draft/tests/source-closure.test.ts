import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const packageRoot = path.dirname(sourceRoot);
const repositoryRoot = path.resolve(sourceRoot, "../../..");

function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : file.endsWith(".ts") ? [file] : [];
  });
}

it("gives every mechanism and permission leaf one exported authority", () => {
  for (const owner of ["runtime/flow-authoring/draft", "runtime/action-permissions/destructive"]) {
    for (const file of sources(path.join(sourceRoot, owner))) {
      if (file.includes(path.sep + "tests" + path.sep) || path.basename(file) === "index.ts") continue;
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const declarations = source.statements.filter((statement) => ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
      const count = declarations.reduce((total, statement) => total + (ts.isVariableStatement(statement) ? statement.declarationList.declarations.length : 1), 0);
      expect(count, path.relative(repositoryRoot, file)).toBe(1);
    }
  }
});

it("keeps every draft source and test independent of programs, including erased imports", () => {
  const configPath = path.join(packageRoot, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot).options;
  const cache = ts.createModuleResolutionCache(repositoryRoot, (file) => file, options);
  const pending = sources(path.join(sourceRoot, "runtime/flow-authoring/draft"));
  const visited = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const relative = path.relative(repositoryRoot, file).replaceAll("\\", "/");
    expect(relative).not.toMatch(/(?:^|\/)programs\//u);
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const imports: string[] = [];
    function visit(node: ts.Node): void {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) imports.push(node.argument.literal.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) imports.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const specifier of imports) {
      const target = ts.resolveModuleName(specifier, file, options, ts.sys, cache).resolvedModule?.resolvedFileName;
      if (specifier.startsWith(".")) expect(target, `${relative}: ${specifier}`).toBeDefined();
      if (target) {
        const absolute = path.resolve(target);
        if (absolute.startsWith(path.join(repositoryRoot, "packages") + path.sep) && !absolute.includes("node_modules")) pending.push(absolute);
      }
    }
  }
  expect(visited.size).toBeGreaterThan(80);
  expect(visited.has(path.join(sourceRoot, "components/automation/index.ts"))).toBe(true);
  expect(visited.has(path.join(sourceRoot, "runtime/action-permissions/index.ts"))).toBe(true);
});
