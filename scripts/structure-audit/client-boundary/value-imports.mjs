// The module specifiers one file loads for their values: static imports and
// re-exports, less those that name only types. Dynamic imports are not read.

/**
 * @param {{ ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @param {string} file
 * @returns {string[]}
 */
export function valueImports(ctx, file) {
  const { ts } = ctx;
  const found = [];
  for (const statement of ctx.parse(file).statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      const onlyTypes = clause !== undefined && clause.name === undefined && named !== undefined
        && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly);
      if (!onlyTypes) found.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.isTypeOnly) continue;
      const named = statement.exportClause;
      const onlyTypes = named !== undefined && ts.isNamedExports(named) && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly);
      if (!onlyTypes) found.push(statement.moduleSpecifier.text);
    }
  }
  return found;
}
