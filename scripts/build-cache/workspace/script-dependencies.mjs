import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Static local module closure; never executes modules or walks installed packages. */
export function scriptDependencies(entries, repoRoot) {
  const root = realpathSync(repoRoot);
  const visited = new Set();
  const files = new Set();
  const pending = [...entries];
  while (pending.length) {
    const file = path.resolve(pending.pop());
    const physical = realpathSync(file); // Missing dependencies must fail discovery.
    const relative = path.relative(root, physical);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      || relative.split(path.sep).includes("node_modules")) {
      throw new Error(`build-cache: script dependency is not a repository-local module: ${file}`);
    }
    if (!statSync(physical).isFile() || !/\.[cm]?js$/u.test(physical)) {
      throw new Error(`build-cache: unsupported local script dependency: ${file}`);
    }
    files.add(file);
    files.add(physical);
    const key = process.platform === "win32" ? physical.toLowerCase() : physical;
    if (visited.has(key)) continue;
    visited.add(key);
    const syntax = ts.createSourceFile(physical, readFileSync(physical, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0];
      if (specifier && ts.isStringLiteralLike(specifier) && /^\.{1,2}\//u.test(specifier.text)) {
        pending.push(path.resolve(path.dirname(physical), specifier.text));
      }
      ts.forEachChild(node, visit);
    }
    visit(syntax);
  }
  return [...files].sort();
}
