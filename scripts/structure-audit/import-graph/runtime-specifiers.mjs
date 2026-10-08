// The module specifiers of one file that order module evaluation: the static
// imports and re-exports that survive into the emitted module graph.
//
// Erased, and so not an edge: a declaration written `import type ... from` or
// `export type ... from`. Nothing else is. Both repositories compile with
// `verbatimModuleSyntax`, under which `import { type A } from "x"` still emits
// `import {} from "x"`, and that loads -- and so orders -- "x" exactly like a
// value import. The imports rule's `valueOnly` boundaries draw the same line.
//
// A dynamic `import("...")` is not an edge either. It runs after the static
// graph has finished evaluating, so it cannot be the import that leaves a
// module half-evaluated when another reads it -- which is the whole fault a
// cycle causes.

/**
 * @param {{ ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @param {string} file
 * @returns {{ text: string, line: number }[]}
 */
export function runtimeSpecifiers(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const found = [];

  const record = (node) => {
    if (!node || !ts.isStringLiteralLike(node)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    found.push({ text: node.text, line });
  };

  // Static imports and exports are top-level statements; nothing nested can
  // be one, so only the file's own statements are read.
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly !== true) record(statement.moduleSpecifier);
    } else if (ts.isExportDeclaration(statement)) {
      if (!statement.isTypeOnly) record(statement.moduleSpecifier);
    }
  }
  return found;
}
