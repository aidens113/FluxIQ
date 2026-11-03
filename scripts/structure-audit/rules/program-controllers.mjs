// A controller program controls the framework and owns no backend of its own.
// Two checks over each program CONFIG.controllerPrograms names: a source file
// outside its allowed entries fails outright, because that is backend code back
// in the program; and a function past its line budget is counted and ratcheted,
// because a handler that long has logic in it that belongs to the framework.
//
// The budget is per function, not per file. A file holding thirty endpoints is
// long and thin: each registers a permission and a resource and makes one call to
// the service. `register*` functions are those tables, so they do not count.
//
// The other half of the boundary, that nothing outside the program imports it, is
// CONFIG.importBoundaries.

export const id = "program-controllers";
export const title = "Controller programs hold no backend";

function functionName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (parent && (ts.isPropertyAssignment(parent) || ts.isVariableDeclaration(parent)) && ts.isIdentifier(parent.name)) return parent.name.text;
  return "anonymous";
}

function longFunctions(ctx, file, budget) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const lineOf = (position) => sourceFile.getLineAndCharacterOfPosition(position).line;
  const found = [];
  const seen = new Map();
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body) {
      const name = functionName(ts, node);
      if (!name.startsWith("register")) {
        const ordinal = (seen.get(name) ?? 0) + 1;
        seen.set(name, ordinal);
        const lines = lineOf(node.body.getEnd()) - lineOf(node.body.getStart(sourceFile)) + 1;
        if (lines > budget) found.push({ name, ordinal, lines, line: lineOf(node.getStart(sourceFile)) + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function run(ctx) {
  const findings = [];
  for (const program of ctx.CONFIG.controllerPrograms ?? []) {
    const prefix = `${program.path}/`;
    for (const file of ctx.sourceFiles) {
      if (!file.startsWith(prefix) || ctx.isTestFile(file)) continue;
      const entry = file.slice(prefix.length).split("/")[0];
      if (!program.allowed.includes(entry)) {
        findings.push({
          rule: id, key: file, value: 1, limit: 0, path: file,
          message: `${file}: ${program.path} may only hold ${program.allowed.join(", ")}. ${program.reason} Move this to the framework area that owns it.`,
          severity: "fail", ratchet: false
        });
        continue;
      }
      for (const found of longFunctions(ctx, file, program.maxFunctionLines)) {
        findings.push({
          rule: id, key: `${file}::${found.name}#${found.ordinal}`, value: found.lines, limit: program.maxFunctionLines, path: file,
          message: `${file}:${found.line}: ${found.name} is ${found.lines} lines, past the ${program.maxFunctionLines}-line budget for a controller function. Keep the endpoint here and move the logic to the framework.`,
          severity: "fail", ratchet: true
        });
      }
    }
  }
  return findings;
}
