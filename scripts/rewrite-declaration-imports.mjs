import { readdir, readFile, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import ts from "typescript";
import { createPublicImportResolver } from "./declarations/index.mjs";

const outputRoot = path.resolve(process.argv[2] ?? "dist");
// Resolve the published graph as an ESM consumer does. Inheriting the build's
// baseUrl/paths here would accept the very workspace aliases this gate rejects.
const compilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
const resolutionCache = ts.createModuleResolutionCache(outputRoot, (name) => ts.sys.useCaseSensitiveFileNames ? name : name.toLowerCase(), compilerOptions);
const declarations = [];
const ambientModules = [];
const problems = [];

for (const filePath of await declarationFiles(outputRoot)) {
  const source = await readFile(filePath, "utf8");
  const syntax = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) imports.push(node.moduleSpecifier);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) imports.push(node.argument.literal);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) imports.push(node.moduleReference.expression);
    else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      if (ts.isExternalModule(syntax)) imports.push(node.name);
      else ambientModules.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  declarations.push({ filePath, source, syntax, imports: imports.filter(ts.isStringLiteralLike) });
}

const publicImport = createPublicImportResolver(declarations, compilerOptions);
for (const declaration of declarations) {
  const replacements = [];
  for (const literal of declaration.imports) {
    const relative = /^\.{1,2}(?:\/|$)/u.test(literal.text);
    const specifier = relative ? literal.text.replace(/\.ts$/u, ".js") : publicImport(literal) ?? literal.text;
    let issue;
    if (path.posix.isAbsolute(specifier) || path.win32.isAbsolute(specifier) || /^[a-z][a-z\d+.-]*:/iu.test(specifier) && !isBuiltin(specifier) || specifier.includes("\\")) {
      issue = "absolute or platform-specific path";
    } else if (relative && !withinOutput(path.resolve(path.dirname(declaration.filePath), specifier))) {
      issue = "relative path escapes declaration output";
    } else if (!isBuiltin(specifier) && !ambientModules.some((name) => ambientMatches(name, specifier))) {
      const mode = ts.isModuleDeclaration(literal.parent) ? ts.ModuleKind.ESNext : ts.getModeForUsageLocation(declaration.syntax, literal, compilerOptions) ?? ts.ModuleKind.ESNext;
      const resolved = ts.resolveModuleName(specifier, declaration.filePath, compilerOptions, ts.sys, resolutionCache, undefined, mode).resolvedModule;
      if (!resolved) issue = "not resolvable without workspace aliases";
      else if (relative && !withinOutput(resolved.resolvedFileName)) issue = "relative import resolves outside declaration output";
    }
    if (issue) {
      const position = declaration.syntax.getLineAndCharacterOfPosition(literal.getStart(declaration.syntax));
      problems.push(`${path.relative(outputRoot, declaration.filePath)}:${position.line + 1}:${position.character + 1}: ${JSON.stringify(specifier)} (${issue})`);
    }
    if (specifier !== literal.text) {
      const start = literal.getStart(declaration.syntax), end = literal.getEnd();
      const original = declaration.source.slice(start, end);
      replacements.push({ start, end, text: /\.ts(["'])$/u.test(original) ? original.replace(/\.ts(["'])$/u, ".js$1") : JSON.stringify(specifier) });
    }
  }
  declaration.rewritten = replacements.sort((left, right) => right.start - left.start).reduce((text, replacement) => text.slice(0, replacement.start) + replacement.text + text.slice(replacement.end), declaration.source);
}

if (problems.length) throw new Error(`Nonportable declaration imports:\n${problems.join("\n")}`);
for (const { filePath, source, rewritten } of declarations) {
  if (rewritten !== source) await writeFile(filePath, rewritten, "utf8");
}

function withinOutput(target) {
  const relative = path.relative(outputRoot, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function ambientMatches(pattern, specifier) {
  const wildcard = pattern.indexOf("*");
  return wildcard < 0 ? pattern === specifier : specifier.startsWith(pattern.slice(0, wildcard)) && specifier.endsWith(pattern.slice(wildcard + 1));
}

async function declarationFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await declarationFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".d.ts")) files.push(target);
  }
  return files;
}
