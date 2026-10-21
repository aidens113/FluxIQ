// The places one file imports or loads a module, for the package-exports rule.
// Only import and load expressions count; a string anywhere else is not read,
// so tooling that names a build path to check its freshness is never refused.
//
// A load is: an `import`/`export ... from` declaration (type-only ones too:
// they resolve through `exports` like any other), `import x = require(...)`, a
// dynamic `import(...)`, `require(...)` and `require.resolve(...)`, a require
// made by `createRequire(...)` (called at once or through the name it is bound
// to) and its `.resolve(...)`, and `import.meta.resolve(...)`.
//
// Three kinds of site come back:
//   "specifier"    a load's argument written as one literal: the specifier
//   "path-literal" a literal inside a load's argument that is built, such as
//                  `import(pathToFileURL(path.join(root, "<literal>")).href)`
//                  or a template literal's text; a nested load is a site of
//                  its own and is not read twice
//   "beside-entry" a module address built beside a package's entry:
//                  `new URL(<literal>, import.meta.resolve("<bare>"))`
//                  anywhere, or a load whose built argument combines
//                  `import.meta.resolve("<bare>")` with another literal
//
// A site written as an `import`/`export ... from` declaration is marked
// `declaration`: tsc resolves and checks that dependency in a file it checks.

/**
 * @typedef {{ kind: "specifier" | "path-literal" | "beside-entry", text: string, line: number, declaration?: true }} LoadSite
 */

/**
 * @param {{ ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @param {string} file
 * @returns {LoadSite[]} in source order
 */
export function loadSites(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const sites = [];
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const requireNames = new Set(["require"]);

  const isCreateRequire = (node) => ts.isCallExpression(node) && (
    (ts.isIdentifier(node.expression) && node.expression.text === "createRequire") ||
    (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "createRequire")
  );
  const isRequire = (node) => (ts.isIdentifier(node) && requireNames.has(node.text)) || isCreateRequire(node);
  const isImportMeta = (node) => ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword && node.name.text === "meta";
  const isMetaResolve = (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "resolve" && isImportMeta(node.expression.expression);
  const isLoad = (node) => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (callee.kind === ts.SyntaxKind.ImportKeyword || isRequire(callee)) return true;
    return ts.isPropertyAccessExpression(callee) && callee.name.text === "resolve" && (isRequire(callee.expression) || isImportMeta(callee.expression));
  };
  const literalText = (node) => (node && ts.isStringLiteralLike(node) ? node.text : null);
  const besideEntry = (node) => ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" &&
    literalText(node.arguments?.[0]) !== null && node.arguments.length > 1 && isMetaResolve(node.arguments[1]) &&
    literalText(node.arguments[1].arguments[0]) !== null;

  // Names a created require is bound to, wherever in the file they are bound.
  const bind = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isCreateRequire(node.initializer)) requireNames.add(node.name.text);
    ts.forEachChild(node, bind);
  };
  bind(sourceFile);

  const builtArgument = (argument) => {
    const literals = [];
    const resolved = [];
    const scan = (node) => {
      if (besideEntry(node)) return;
      if (isMetaResolve(node)) {
        const bare = literalText(node.arguments[0]);
        if (bare !== null) resolved.push({ text: bare, node });
        return;
      }
      if (isLoad(node)) return;
      if (ts.isStringLiteralLike(node)) {
        literals.push({ text: node.text, node });
        return;
      }
      if (ts.isTemplateExpression(node)) {
        literals.push({ text: node.head.text, node: node.head });
        for (const span of node.templateSpans) {
          literals.push({ text: span.literal.text, node: span.literal });
          scan(span.expression);
        }
        return;
      }
      ts.forEachChild(node, scan);
    };
    scan(argument);
    for (const { text, node } of literals) if (text !== "") sites.push({ kind: "path-literal", text, line: lineOf(node) });
    if (literals.some(({ text }) => text !== "")) {
      for (const { text, node } of resolved) sites.push({ kind: "beside-entry", text, line: lineOf(node) });
    }
  };

  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && literalText(node.moduleSpecifier) !== null) {
      sites.push({ kind: "specifier", text: node.moduleSpecifier.text, line: lineOf(node.moduleSpecifier), declaration: true });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && literalText(node.moduleReference.expression) !== null) {
      sites.push({ kind: "specifier", text: node.moduleReference.expression.text, line: lineOf(node.moduleReference.expression) });
    } else if (besideEntry(node)) {
      sites.push({ kind: "beside-entry", text: node.arguments[1].arguments[0].text, line: lineOf(node) });
    } else if (isLoad(node) && node.arguments.length > 0) {
      const [argument] = node.arguments;
      if (literalText(argument) !== null) sites.push({ kind: "specifier", text: argument.text, line: lineOf(argument) });
      else builtArgument(argument);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return sites.sort((a, b) => a.line - b.line);
}
