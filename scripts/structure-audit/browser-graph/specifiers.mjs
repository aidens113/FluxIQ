// The module specifiers of one file that a bundler keeps: what survives into
// the emitted module graph, and so what a browser bundle has to load.
//
// Erased, and so not followed: `import type ... from`, `export type ... from`,
// and an import or re-export whose every named binding is marked `type`, which
// a TypeScript-aware bundler drops. Kept: a default or namespace binding, any
// unmarked named binding, a bare `import "..."` for effect, `export * from`,
// and a dynamic `import("...")` with a literal specifier.
//
// Deliberately conservative the other way: a value binding used only in type
// positions is still counted. A bundler may drop it, but an audit that guessed
// so would pass the exact import that broke the extension in the first place.

/**
 * @param {{ ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @param {string} file
 * @returns {{ text: string, line: number }[]}
 */
export function valueSpecifiers(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const found = [];

  const record = (node) => {
    if (!node || !ts.isStringLiteralLike(node)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    found.push({ text: node.text, line });
  };

  const allTypeOnly = (elements) => elements.length > 0 && elements.every((element) => element.isTypeOnly);

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const erased = clause !== undefined && (
        clause.isTypeOnly ||
        (clause.name === undefined && named !== undefined && ts.isNamedImports(named) && allTypeOnly(named.elements))
      );
      if (!erased) record(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      const erased = node.isTypeOnly || (clause !== undefined && ts.isNamedExports(clause) && allTypeOnly(clause.elements));
      if (!erased) record(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      record(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}
