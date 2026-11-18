import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `load-launcher.ts` imports an operator's module natively at run time. The
// package build (`tsconfig.build.json`, `rewriteRelativeImportExtensions`)
// wraps every dynamic import's argument in `__rewriteRelativeImportExtension`,
// which moves the `turbopackIgnore` hint off the `import()`: a bundler or
// tracer that reads the built file (the web panel's server traces) then warns
// it cannot resolve the dynamic import. `tsconfig.runtime-imports.json`
// re-emits it without the rewrite, as it does `import-host-module.ts`.
const packageRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const sourcePath = path.join(packageRoot, "src/server/managed-hosts/load-launcher.ts");
let temporaryRoot = "";
let outputRoot = "";

beforeAll(() => {
  temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "fluxiq-native-launcher-import-"));
  const configPath = path.join(packageRoot, "tsconfig.runtime-imports.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, packageRoot, undefined, configPath);
  expect(parsed.errors).toEqual([]);
  expect(parsed.fileNames).toContain(sourcePath.replaceAll("\\", "/"));
  const { tsBuildInfoFile: _buildInfo, ...compilerOptions } = parsed.options;
  outputRoot = path.join(temporaryRoot, "compiled");
  const program = ts.createProgram(parsed.fileNames, { ...compilerOptions, incremental: false, outDir: outputRoot });
  expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
  expect(program.emit().emitSkipped).toBe(false);
});

afterAll(() => {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
});

describe("the SDK's compiled managed host launcher loader", () => {
  it("keeps the native import directives on the import's argument, with no extension-rewriting helper", () => {
    const compiledPath = path.join(outputRoot, "server/managed-hosts/load-launcher.js");
    const emitted = readFileSync(compiledPath, "utf8");
    const syntax = ts.createSourceFile(compiledPath, emitted, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const imports: ts.CallExpression[] = [];
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) imports.push(node);
      ts.forEachChild(node, visit);
    }
    visit(syntax);
    expect(imports).toHaveLength(1);
    const call = imports[0]!;
    const directives = emitted.slice(call.expression.end, call.arguments[0]!.getStart(syntax));
    expect(directives).toContain("webpackIgnore: true");
    expect(directives).toContain("turbopackIgnore: true");
    expect(emitted).not.toContain("__rewriteRelativeImportExtension");
  });

  it("re-emits the type-only files it pulls into the program with no relative .ts specifier left in them", () => {
    for (const file of ["host-launcher.js", "host-launch-request.js", "launched-host.js", "load-launcher.js"]) {
      expect(readFileSync(path.join(outputRoot, "server/managed-hosts", file), "utf8")).not.toMatch(/from\s*["']\.{1,2}\/[^"']*\.ts["']/u);
    }
  });
});
