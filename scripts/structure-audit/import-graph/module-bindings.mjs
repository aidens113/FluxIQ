// What one module imports and exports, binding by binding, for binding-reach.mjs.
// Type-only declarations and type-only elements are left out: a type carries
// no value, so it cannot carry content from one module into another.

/**
 * @typedef {{ text: string, line: number, names: string[], whole: boolean, effect: boolean }} ValueImport
 *   `names` are the imported names (`default` for a default import); `whole`
 *   is a namespace import or a literal dynamic `import()`; `effect` is a bare
 *   `import "..."`.
 * @typedef {{
 *   imports: ValueImport[],
 *   local: Set<string>,
 *   importedExports: Map<string, { text: string, line: number, name: string | null }>,
 *   reexports: Map<string, { text: string, line: number, name: string | null }>,
 *   stars: { text: string, line: number }[]
 * }} ModuleBindings
 *   `local`: names this module declares and exports. `importedExports`: a
 *   name exported from an import binding (`import { a } from "x"; export { a }`),
 *   `name: null` for a namespace binding. `reexports`: `export { a as b } from
 *   "x"`, `name: null` for `export * as b from "x"`. `stars`: `export * from`.
 */

/**
 * @param {{ ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @param {string} file
 * @returns {ModuleBindings}
 */
export function moduleBindings(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const result = { imports: [], local: new Set(), importedExports: new Map(), reexports: new Map(), stars: [] };
  const importedBy = new Map();
  const localExportClauses = [];
  const exported = (node) => ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export;
  const isDefault = (node) => ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Default;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const text = statement.moduleSpecifier.text;
      const line = lineOf(statement.moduleSpecifier);
      if (clause === undefined) {
        result.imports.push({ text, line, names: [], whole: false, effect: true });
        continue;
      }
      if (clause.isTypeOnly) continue;
      const names = [];
      let whole = false;
      if (clause.name) {
        names.push("default");
        importedBy.set(clause.name.text, { text, line, name: "default" });
      }
      const bound = clause.namedBindings;
      if (bound && ts.isNamespaceImport(bound)) {
        whole = true;
        importedBy.set(bound.name.text, { text, line, name: null });
      } else if (bound) {
        for (const element of bound.elements) {
          if (element.isTypeOnly) continue;
          const name = (element.propertyName ?? element.name).text;
          names.push(name);
          importedBy.set(element.name.text, { text, line, name });
        }
      }
      if (names.length > 0 || whole) result.imports.push({ text, line, names, whole, effect: false });
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) {
        const text = statement.moduleSpecifier.text;
        const line = lineOf(statement.moduleSpecifier);
        if (clause === undefined) result.stars.push({ text, line });
        else if (ts.isNamespaceExport(clause)) result.reexports.set(clause.name.text, { text, line, name: null });
        else for (const element of clause.elements) {
          if (!element.isTypeOnly) result.reexports.set(element.name.text, { text, line, name: (element.propertyName ?? element.name).text });
        }
      } else if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) if (!element.isTypeOnly) localExportClauses.push(element);
      }
    } else if (ts.isExportAssignment(statement)) {
      result.local.add("default");
    } else if (exported(statement)) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) collectNames(ts, declaration.name, result.local);
      } else if (isDefault(statement)) {
        result.local.add("default");
      } else if (statement.name && ts.isIdentifier(statement.name) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) {
        result.local.add(statement.name.text);
      }
    }
  }

  for (const element of localExportClauses) {
    const localName = (element.propertyName ?? element.name).text;
    const imported = importedBy.get(localName);
    if (imported) result.importedExports.set(element.name.text, imported);
    else result.local.add(element.name.text);
  }

  // A literal dynamic import loads the whole module, wherever it is written.
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      result.imports.push({ text: node.arguments[0].text, line: lineOf(node), names: [], whole: true, effect: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return result;
}

function collectNames(ts, name, into) {
  if (ts.isIdentifier(name)) into.add(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) collectNames(ts, element.name, into);
}
