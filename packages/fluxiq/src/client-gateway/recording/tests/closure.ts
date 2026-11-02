import ts from "typescript";

/** Follows bound declarations, including erased imports, without loading unrelated barrel exports. */
export function recordingDeclarationClosure(program: ts.Program, roots: string[]): { files: string[]; forbiddenImports: string[] } {
  const checker = program.getTypeChecker();
  const queue = roots.map(filename => program.getSourceFile(filename)).filter((file): file is ts.SourceFile => file !== undefined);
  const visited = new Set<string>();
  const forbiddenImports = new Set<string>();
  const enqueueSymbol = (symbol: ts.Symbol | undefined) => {
    if (!symbol) return;
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    for (const declaration of target.declarations ?? []) {
      const source = declaration.getSourceFile();
      if (!source.fileName.includes("node_modules")) queue.push(source);
    }
  };
  const moduleExports = (literal: ts.Expression) => {
    const module = checker.getSymbolAtLocation(literal);
    if (!module) return;
    for (const symbol of checker.getExportsOfModule(module)) enqueueSymbol(symbol);
  };
  const checkSpecifier = (literal: ts.Node) => {
    if (!ts.isStringLiteralLike(literal)) return;
    if (/(?:programs\/automation-studio|^(?:@fluxiq\/contracts|fluxiq)\/automation-studio(?:\/|$))/u.test(literal.text)) forbiddenImports.add(`${literal.getSourceFile().fileName}: ${literal.text}`);
  };
  while (queue.length) {
    const file = queue.pop()!;
    if (visited.has(file.fileName)) continue;
    visited.add(file.fileName);
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement)) {
        checkSpecifier(statement.moduleSpecifier);
        const clause = statement.importClause;
        if (!clause) moduleExports(statement.moduleSpecifier);
        if (clause?.name) enqueueSymbol(checker.getSymbolAtLocation(clause.name));
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) enqueueSymbol(checker.getSymbolAtLocation(element.name));
        } else if (bindings) moduleExports(statement.moduleSpecifier);
      } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
        checkSpecifier(statement.moduleSpecifier);
        const clause = statement.exportClause;
        if (clause && ts.isNamedExports(clause)) {
          for (const element of clause.elements) enqueueSymbol(checker.getSymbolAtLocation(element.name));
        } else moduleExports(statement.moduleSpecifier);
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        checkSpecifier(node.argument.literal);
        if (node.qualifier) enqueueSymbol(checker.getSymbolAtLocation(node.qualifier));
        else if (ts.isStringLiteral(node.argument.literal)) moduleExports(node.argument.literal);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const literal = node.arguments[0];
        if (literal && ts.isStringLiteral(literal)) {
          checkSpecifier(literal);
          moduleExports(literal);
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(file, visit);
  }
  return { files: [...visited], forbiddenImports: [...forbiddenImports] };
}
