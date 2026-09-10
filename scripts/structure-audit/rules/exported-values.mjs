// Modules keep a narrow public surface: one class per file, one component per
// file, and few exported values overall. Counted are top-level exported value
// declarations -- function, class, enum, each const/let/var declarator,
// `export default`, and each element of a local `export { ... }`. Types,
// interfaces and re-exports (anything with a `from` clause) are not values, and
// barrels (index files) are exempt because re-exporting is their job.
// Ratcheted per path, separately for classes, components and total values.

export const id = "exported-values";
export const title = "Modules keep a narrow surface of exported values";

const COMPONENT_EXTENSIONS = new Set([".tsx", ".jsx"]);

function isPascalCase(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name);
}

function isExported(ts, node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function countExports(ts, sourceFile, componentFile) {
  const counts = { values: 0, classes: 0, components: 0 };
  const addComponent = (name) => {
    if (componentFile && typeof name === "string" && isPascalCase(name)) counts.components += 1;
  };
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      // `export default <expression>`; `export = x` is not an export of a value.
      if (!statement.isExportEquals) counts.values += 1;
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      // Only a local `export { a, b }` adds names; `... from "./x"` re-exports.
      if (statement.moduleSpecifier || statement.isTypeOnly) continue;
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        counts.values += 1;
      }
      continue;
    }
    if (!isExported(ts, statement)) continue;
    if (ts.isFunctionDeclaration(statement)) {
      counts.values += 1;
      addComponent(statement.name?.text);
      continue;
    }
    if (ts.isClassDeclaration(statement)) {
      counts.values += 1;
      counts.classes += 1;
      continue;
    }
    if (ts.isEnumDeclaration(statement)) {
      counts.values += 1;
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        counts.values += 1;
        if (ts.isIdentifier(declaration.name)) addComponent(declaration.name.text);
      }
    }
  }
  return counts;
}

export function run(ctx) {
  const { LIMITS, ts } = ctx;
  const findings = [];
  for (const file of ctx.scriptFiles) {
    if (ctx.isTestFile(file)) continue;
    const extension = ctx.extname(file);
    if (ctx.basename(file).slice(0, -extension.length) === "index") continue;
    const counts = countExports(ts, ctx.parse(file), COMPONENT_EXTENSIONS.has(extension));

    if (counts.classes > LIMITS.exportedClasses) {
      findings.push({
        rule: id, key: `${file}::classes`, value: counts.classes, limit: LIMITS.exportedClasses, path: file,
        message: `${file}: ${counts.classes} exported classes, exceeding the ${LIMITS.exportedClasses}-class limit. One class per file, in a file named after it.`,
        severity: "fail", ratchet: true
      });
    }

    if (counts.components > LIMITS.exportedComponents) {
      findings.push({
        rule: id, key: `${file}::components`, value: counts.components, limit: LIMITS.exportedComponents, path: file,
        message: `${file}: ${counts.components} exported components, exceeding the ${LIMITS.exportedComponents}-component limit. One component per file under components/, with a barrel.`,
        severity: "fail", ratchet: true
      });
    }

    if (counts.values > LIMITS.exportedValues) {
      findings.push({
        rule: id, key: `${file}::values`, value: counts.values, limit: LIMITS.exportedValues, path: file,
        message: `${file}: ${counts.values} exported values, exceeding the ${LIMITS.exportedValues}-value limit. Split the module by responsibility, or stop exporting what no other module imports.`,
        severity: "fail", ratchet: true
      });
    } else if (counts.values > LIMITS.exportedValuesWarn) {
      findings.push({
        rule: id, key: `${file}::values`, value: counts.values, limit: LIMITS.exportedValuesWarn, path: file,
        message: `${file}: ${counts.values} exported values is past the ${LIMITS.exportedValuesWarn}-value advisory threshold. Keep the module's surface to one responsibility.`,
        severity: "warn", ratchet: false
      });
    }
  }
  return findings;
}
