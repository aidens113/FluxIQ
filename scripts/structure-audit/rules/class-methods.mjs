// Classes stay under the method limit. A class that outgrows it is a
// namespace, not an object: it holds several responsibilities that each want
// their own collaborator. Counted members are method declarations, get/set
// accessors, and properties initialised to an arrow function or a function
// expression; the constructor is not a method. Ratcheted per class.

export const id = "class-methods";
export const title = "Classes stay under the method limit";

function memberCount(ts, node) {
  let count = 0;
  for (const member of node.members) {
    if (ts.isConstructorDeclaration(member)) continue;
    if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
      count += 1;
      continue;
    }
    if (ts.isPropertyDeclaration(member) && member.initializer
      && (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))) {
      count += 1;
    }
  }
  return count;
}

function collectClasses(ts, node, sourceFile, out) {
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    out.push({
      name: node.name?.text ?? "<anonymous>",
      count: memberCount(ts, node),
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    });
  }
  ts.forEachChild(node, (child) => collectClasses(ts, child, sourceFile, out));
}

export function run(ctx) {
  const { LIMITS, ts } = ctx;
  const findings = [];
  for (const file of ctx.scriptFiles) {
    if (ctx.isTestFile(file)) continue;
    const sourceFile = ctx.parse(file);
    const classes = [];
    collectClasses(ts, sourceFile, sourceFile, classes);
    for (const found of classes) {
      const { name, count, line } = found;
      const where = `${file}:${line}`;
      if (count > LIMITS.classMethods) {
        findings.push({
          rule: id, key: `${file}::${name}`, value: count, limit: LIMITS.classMethods, path: file, line,
          message: `${where}: class ${name} has ${count} methods, exceeding the ${LIMITS.classMethods}-method limit. Split it into a facade over collaborators grouped by responsibility.`,
          severity: "fail", ratchet: true
        });
      } else if (count > LIMITS.classMethodsWarn) {
        findings.push({
          rule: id, key: `${file}::${name}`, value: count, limit: LIMITS.classMethodsWarn, path: file, line,
          message: `${where}: class ${name} has ${count} methods, past the ${LIMITS.classMethodsWarn}-method advisory threshold. Move a group of related methods onto a collaborator before it reaches ${LIMITS.classMethods}.`,
          severity: "warn", ratchet: false
        });
      }
    }
  }
  return findings;
}
