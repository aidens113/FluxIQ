import { isBuiltin } from "node:module";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps the forwarding and parking value closures free of Node and concrete producer composition", async () => {
  const contextUrl = new URL("../../../../../../../../../scripts/structure-audit/context.mjs", import.meta.url);
  const graphUrl = new URL("../../../../../../../../../scripts/structure-audit/import-graph/index.mjs", import.meta.url);
  const { createContext } = await import(contextUrl.href);
  const { buildRuntimeGraph, reachableModules } = await import(graphUrl.href);
  const context = createContext();
  const graph = buildRuntimeGraph(context);
  const base = "packages/fluxiq/src/programs/automation-studio/runtime/";
  const entries = [base + "build-execution/forwarding/index.ts", base + "parking/index.ts"];
  const files = new Set<string>(entries.flatMap(entry => [entry, ...reachableModules(graph, entry)]));
  const forbidden: string[] = [];
  for (const file of files) {
    if (file.endsWith("/tools/observer.ts") || file.endsWith("/tools/callback-scope.ts") || file.includes("/flow-bootstrap/") || file.includes("/service/")) forbidden.push(file);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const erased = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly;
        if (!erased && isBuiltin(node.moduleSpecifier.text)) forbidden.push(`${file}: ${node.moduleSpecifier.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(context.parse(file));
  }
  expect(forbidden).toEqual([]);
  expect(files.size).toBeGreaterThan(10);
});
