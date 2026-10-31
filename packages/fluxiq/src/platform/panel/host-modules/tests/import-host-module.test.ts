import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const sourcePath = path.join(packageRoot, "src/platform/panel/host-modules/import-host-module.ts");
let temporaryRoot = "";
let compiledPath = "";

beforeAll(() => {
  temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "fluxiq-native-host-import-"));
  const configPath = path.join(packageRoot, "tsconfig.runtime-imports.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, packageRoot, undefined, configPath);
  expect(parsed.errors).toEqual([]);
  expect(parsed.fileNames).toEqual([sourcePath.replaceAll("\\", "/")]);
  const { tsBuildInfoFile: _buildInfo, ...compilerOptions } = parsed.options;
  const outputRoot = path.join(temporaryRoot, "compiled");
  const program = ts.createProgram(parsed.fileNames, { ...compilerOptions, incremental: false, outDir: outputRoot });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
  expect(program.emit().emitSkipped).toBe(false);
  compiledPath = path.join(outputRoot, "platform/panel/host-modules/import-host-module.js");
  writeFileSync(path.join(temporaryRoot, "package.json"), JSON.stringify({ type: "module" }));
});

afterAll(() => {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
});

describe("the SDK's compiled native host importer", () => {
  it("keeps the native import directives on its argument and emits correct source and declaration maps", () => {
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
    expect(readFileSync(compiledPath.replace(/\.js$/u, ".d.ts"), "utf8"))
      .toContain("importHostModule(modulePath: string): Promise<Record<string, unknown>>");
    for (const mapPath of [compiledPath + ".map", compiledPath.replace(/\.js$/u, ".d.ts.map")]) {
      const map = JSON.parse(readFileSync(mapPath, "utf8")) as { sourceRoot: string; sources: string[]; mappings: string };
      expect(map.sources).toHaveLength(1);
      expect(path.resolve(path.dirname(mapPath), map.sourceRoot, map.sources[0]!)).toBe(sourcePath);
      expect(map.mappings).not.toBe("");
    }
  });

  it("loads an import-only public package from an ESM host with the original file URL and module identity", () => {
    const fixturePackage = path.join(temporaryRoot, "node_modules/@fixture/native-host");
    mkdirSync(fixturePackage, { recursive: true });
    writeFileSync(path.join(fixturePackage, "package.json"), JSON.stringify({
      name: "@fixture/native-host",
      type: "module",
      exports: { "./registration": { import: "./registration.mjs" } }
    }));
    writeFileSync(path.join(fixturePackage, "registration.mjs"), "export const marker = { registered: true };\n");
    const hostPath = path.join(temporaryRoot, "host with spaces # 1.mjs");
    writeFileSync(hostPath, [
      'import { marker } from "@fixture/native-host/registration";',
      "export { marker };",
      "export const moduleUrl = import.meta.url;",
      "export function registerFluxIQHost(instance) { instance.marker = marker; return instance; }",
      ""
    ].join("\n"));
    const result = execFileSync(process.execPath, ["--input-type=module", "-e", [
      'import { pathToFileURL } from "node:url";',
      `const { importHostModule } = await import(${JSON.stringify(pathToFileURL(compiledPath).href)});`,
      `const hostPath = ${JSON.stringify(hostPath)};`,
      "const loaded = await importHostModule(hostPath);",
      "const direct = await import(pathToFileURL(hostPath).href);",
      "const instance = {};",
      "console.log(JSON.stringify({ sameModule: loaded === direct, originalUrl: loaded.moduleUrl === pathToFileURL(hostPath).href, registered: loaded.registerFluxIQHost(instance) === instance && instance.marker === loaded.marker && instance.marker.registered }));"
    ].join("\n")], { encoding: "utf8" });
    expect(JSON.parse(result)).toEqual({ sameModule: true, originalUrl: true, registered: true });
  });
});
