import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as entry from "../../apps.ts";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const entryPath = resolve(sourceRoot, "apps.ts");

function runtimeSpecifiers(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.importClause?.isTypeOnly) found.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.isTypeOnly) found.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      const argument = node.arguments[0];
      found.push(argument && ts.isStringLiteral(argument) ? argument.text : "<unresolvable dynamic import>");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function inspectGraph() {
  const reached = new Set<string>();
  const problems: string[] = [];
  const queue = [entryPath];
  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index]!;
    if (reached.has(file)) continue;
    reached.add(file);
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const inspect = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && ["Buffer", "process", "__dirname", "__filename"].includes(node.text)) problems.push(`${relative(sourceRoot, file)}: Node global ${node.text}`);
      ts.forEachChild(node, inspect);
    };
    inspect(source);
    for (const specifier of runtimeSpecifiers(source)) {
      if (specifier === "zod") continue; // The contracts package's declared browser-safe dependency.
      if (!specifier.startsWith(".")) {
        problems.push(`${relative(sourceRoot, file)}: forbidden external import ${specifier}`);
        continue;
      }
      const target = ts.resolveModuleName(specifier, file, { moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true }, ts.sys).resolvedModule?.resolvedFileName;
      if (!target || relative(sourceRoot, target).startsWith("..")) {
        problems.push(`${relative(sourceRoot, file)}: unresolved or non-contract import ${specifier}`);
        continue;
      }
      queue.push(resolve(dirname(file), target));
    }
  }
  return { reached, problems };
}

describe("browser-safe apps public entry", () => {
  it("exports the safe API and keeps raw schema issues internal", () => {
    expect(Object.keys(entry).sort()).toEqual([
      "appContractError", "appGrantCovers", "appManifestDigest", "canonicalAppManifest", "parseAppGrant", "parseAppInstallation", "parseAppInvocation", "parseAppManifest", "parseAppOperation", "parseAppOperationResolution", "validateAppInstallationAgainstManifest", "validateAppOperationInputs", "validateAppOperationResult", "verifyAppManifest"
    ].sort());
    const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { exports: Record<string, unknown> };
    expect(packageJson.exports["./apps"]).toEqual({ types: "./dist/apps.d.ts", import: "./dist/apps.js" });
  });

  it("walks every reachable source value edge and rejects Node globals, built-ins or undeclared dependencies", () => {
    const graph = inspectGraph();
    expect(graph.reached.size).toBeGreaterThan(20);
    expect(graph.problems).toEqual([]);
    expect([...graph.reached].every(file => !/[\\/](?:sdk|credentials|cli|tests)[\\/]/u.test(file))).toBe(true);
  });
});
