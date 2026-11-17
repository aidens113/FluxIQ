// The directive prologue of one module: the string-literal statements that
// open it, which is where "use client" and "use server" are read.

/**
 * @param {{ ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @param {string} file
 * @param {string} directive e.g. "use client"
 * @returns {boolean} whether the module's opening statements include the directive
 */
export function hasDirective(ctx, file, directive) {
  const { ts } = ctx;
  for (const statement of ctx.parse(file).statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === directive) return true;
  }
  return false;
}
