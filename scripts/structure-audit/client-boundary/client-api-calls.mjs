// The client-only React APIs one module calls: hooks (`useX`, including
// `React.useX`) and `createContext`. React's `use()` and `cache` are server
// safe, and `use` has no capital after it, so it never matches.

const HOOK = /^use[A-Z0-9_$]/;

/**
 * @param {{ ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @param {string} file
 * @returns {{ name: string, line: number }[]} each distinct API with the line of its first call
 */
export function clientApiCalls(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const found = new Map();
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) ? callee.name.text : null;
      if (name !== null && (HOOK.test(name) || name === "createContext") && !found.has(name)) {
        found.set(name, sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...found].map(([name, line]) => ({ name, line }));
}
