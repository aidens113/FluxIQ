import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

export const automationStudioFeaturePath = dirname(fileURLToPath(import.meta.url));

export type ArchitectureSource = {
  absolutePath: string;
  path: string;
  source: string;
  syntax: ts.SourceFile;
};

export type NamedResidualExemption = {
  path: string;
  ceiling: number;
  owner: string;
  removalPhase: string;
};

export type ResidualAudit = {
  current: ReadonlyMap<string, number>;
  exemptions: readonly NamedResidualExemption[];
  violations: string[];
};

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function featurePath(path: string): string {
  return resolve(automationStudioFeaturePath, path);
}

export function relativeFeaturePath(path: string): string {
  return normalizePath(relative(automationStudioFeaturePath, path));
}

export function architectureSource(path: string): ArchitectureSource {
  const absolutePath = featurePath(path);
  const source = readFileSync(absolutePath, "utf8");
  return {
    absolutePath,
    path,
    source,
    syntax: ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  };
}

export function productionSources(): ArchitectureSource[] {
  return walk(automationStudioFeaturePath)
    .filter((path) => [".ts", ".tsx"].includes(extname(path)))
    .map((path) => ({ absolutePath: path, path: relativeFeaturePath(path) }))
    .filter(({ path }) => !/\.test\.(?:ts|tsx)$/u.test(path))
    .filter(({ path }) => path !== "architecture-test-helpers.ts")
    .map(({ absolutePath, path }) => {
      const source = readFileSync(absolutePath, "utf8");
      return {
        absolutePath,
        path,
        source,
        syntax: ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      };
    });
}

export function testSources(): ArchitectureSource[] {
  return walk(automationStudioFeaturePath)
    .filter((path) => [".ts", ".tsx"].includes(extname(path)))
    .map((path) => ({ absolutePath: path, path: relativeFeaturePath(path) }))
    .filter(({ path }) => /\.test\.(?:ts|tsx)$/u.test(path))
    .map(({ absolutePath, path }) => {
      const source = readFileSync(absolutePath, "utf8");
      return {
        absolutePath,
        path,
        source,
        syntax: ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      };
    });
}
export function sourceLineCount(source: string): number {
  return source.split(/\r?\n/u).length;
}

export function countPattern(source: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  return [...source.matchAll(new RegExp(pattern.source, flags))].length;
}

export function stringLiteralCounts(source: ArchitectureSource, values: ReadonlySet<string>): number {
  let count = 0;
  visit(source.syntax, (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && values.has(node.text)) count += 1;
  });
  return count;
}

export function customEventChannelCounts(
  source: ArchitectureSource,
  allowedChannels: ReadonlySet<string>
): number {
  let count = 0;
  visit(source.syntax, (node) => {
    let channel: string | null = null;
    if (ts.isNewExpression(node) && node.expression.getText(source.syntax) === "CustomEvent") {
      const argument = node.arguments?.[0];
      channel = argument && ts.isStringLiteral(argument) ? argument.text : null;
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression.getText(source.syntax);
      const argument = node.arguments[0];
      if ((method === "addEventListener" || method === "removeEventListener")
        && (receiver === "window" || receiver === "document")
        && argument
        && ts.isStringLiteral(argument)) {
        channel = argument.text;
      }
    }
    if (channel?.match(/^(?:automation-studio|fluxiq):/u) && !allowedChannels.has(channel)) count += 1;
  });
  return count;
}

export function importSpecifiers(source: ArchitectureSource): string[] {
  const imports: string[] = [];
  visit(source.syntax, (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
  });
  return imports;
}

export function callCount(source: ArchitectureSource, predicate: (expression: ts.LeftHandSideExpression) => boolean): number {
  let count = 0;
  visit(source.syntax, (node) => {
    if (ts.isCallExpression(node) && predicate(node.expression)) count += 1;
  });
  return count;
}

export function jsxElementCount(source: ArchitectureSource): number {
  let count = 0;
  visit(source.syntax, (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) count += 1;
  });
  return count;
}

export function functionSpans(source: ArchitectureSource): Array<{ name: string; lines: number }> {
  const spans: Array<{ name: string; lines: number }> = [];
  visit(source.syntax, (node) => {
    if (!isFunctionLike(node)) return;
    const start = source.syntax.getLineAndCharacterOfPosition(node.getStart(source.syntax)).line;
    const end = source.syntax.getLineAndCharacterOfPosition(node.end).line;
    spans.push({ name: functionName(node), lines: end - start + 1 });
  });
  return spans;
}

export function jsxTagCounts(source: ArchitectureSource, forbidden: RegExp): Map<string, number> {
  const counts = new Map<string, number>();
  visit(source.syntax, (node) => {
    let tag: ts.JsxTagNameExpression | undefined;
    if (ts.isJsxElement(node)) tag = node.openingElement.tagName;
    else if (ts.isJsxSelfClosingElement(node)) tag = node.tagName;
    if (!tag) return;
    const name = tag.getText(source.syntax);
    if (forbidden.test(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return counts;
}

export function namedResidualAudit(
  currentInput: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  exemptions: readonly NamedResidualExemption[]
): ResidualAudit {
  const current = currentInput instanceof Map ? currentInput : new Map(Object.entries(currentInput));
  const exemptionByPath = new Map<string, NamedResidualExemption>();
  const violations: string[] = [];

  for (const exemption of exemptions) {
    if (exemptionByPath.has(exemption.path)) {
      violations.push(`DUPLICATE EXEMPTION ${exemption.path}`);
      continue;
    }
    exemptionByPath.set(exemption.path, exemption);
    if (/[*?]/u.test(exemption.path) || !exemption.path.trim()) {
      violations.push(`INVALID EXEMPTION PATH ${exemption.path || "<empty>"}`);
    }
    if (!Number.isSafeInteger(exemption.ceiling) || exemption.ceiling <= 0) {
      violations.push(`INVALID EXEMPTION CEILING ${exemption.path}: ${exemption.ceiling}`);
    }
  }

  for (const [path, count] of current) {
    if (count <= 0) continue;
    const exemption = exemptionByPath.get(path);
    if (!exemption) {
      violations.push(`UNEXEMPTED ${path} (${count})`);
      continue;
    }
    if (!exemption.owner.trim() || !exemption.removalPhase.trim()) {
      violations.push(`UNOWNED ${path}`);
    }
    if (count > exemption.ceiling) {
      violations.push(`GREW ${path}: ${count} > ${exemption.ceiling} [${exemption.owner}; remove ${exemption.removalPhase}]`);
    } else if (count < exemption.ceiling) {
      violations.push(`LOOSE CEILING ${path}: ${count} < ${exemption.ceiling} [${exemption.owner}; remove ${exemption.removalPhase}]`);
    }
  }

  for (const exemption of exemptions) {
    const count = current.get(exemption.path) ?? 0;
    if (count === 0) {
      violations.push(`STALE EXEMPTION ${exemption.path} [${exemption.owner}; remove ${exemption.removalPhase}]`);
    }
  }

  return { current, exemptions, violations };
}

export function mapCounts(entries: Iterable<{ path: string; count: number }>): Map<string, number> {
  const result = new Map<string, number>();
  for (const entry of entries) {
    if (entry.count > 0) result.set(entry.path, (result.get(entry.path) ?? 0) + entry.count);
  }
  return result;
}

export function domainPrivateImportCounts(
  sources: readonly ArchitectureSource[],
  domains: ReadonlySet<string>
): Map<string, number> {
  const entries: Array<{ path: string; count: number }> = [];
  for (const source of sources) {
    const sourceDomain = source.path.split("/")[0] ?? "";
    if (!domains.has(sourceDomain)) continue;
    let count = 0;
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const target = normalizePath(relative(automationStudioFeaturePath, resolve(dirname(source.absolutePath), specifier)));
      const targetDomain = target.split("/")[0] ?? "";
      if (!domains.has(targetDomain) || targetDomain === sourceDomain) continue;
      if (target === targetDomain || target === `${targetDomain}/index`) continue;
      count += 1;
    }
    if (count) entries.push({ path: source.path, count });
  }
  return mapCounts(entries);
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  node.forEachChild((child) => visit(child, callback));
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

function functionName(node: ts.FunctionLikeDeclaration): string {
  if ("name" in node && node.name) return node.name.getText();
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent)) return parent.name.getText();
  return "<anonymous>";
}
