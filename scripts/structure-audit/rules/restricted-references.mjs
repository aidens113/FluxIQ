// A restricted module, string or name appears only in the files allowed to
// name it.
//
// Why. Some references are a capability rather than a style: a model
// provider's host, its SDK, or the environment variable holding its key. The
// downstream web-extension repository must never call a model provider itself
// -- Core owns every provider call -- and before this rule the only thing that
// stopped a future one was a runtime network policy inside the Lab. A provider
// URL written into extension code would type-check, unit-test and build clean,
// and fail (or worse, succeed) only in a live run. This rule makes the same
// mistake fail the build, at the line that wrote it.
//
// Configuration. `CONFIG.restrictedReferences` is a list of entries:
//
//   {
//     name:    "model provider",             // shown in the message
//     imports: [/^openai(\/|$)/],            // module specifiers
//     strings: [/api\.openai\.com/i],        // string and template text
//     names:   [/^OPENAI_API_KEY$/],         // property names read
//     allow:   ["scripts/strip-keys.mjs"],   // exact files or directory prefixes
//     reason:  "...",                        // why the reference is restricted
//     remedy:  "..."                         // what to do instead
//   }
//
// An empty or missing list makes the rule inert; Core lists none, because Core
// is where provider calls belong. Every list inside an entry may be omitted.
// An `allow` item is a repository-relative file or directory with no trailing
// slash, matching that path and everything under it; a file there is skipped
// for that entry only. Patterns are ordinary RegExps (a `g` or `y` flag is
// tolerated: lastIndex is reset before every test).
//
// What is read, over every script file -- tests included, since a test that
// reaches a provider spends money as surely as source does:
//
//   imports  the specifier of `import ... from "s"`, `import "s"`,
//            `export ... from "s"`, `import("s")`, `require("s")`,
//            `import x = require("s")` and the type `import("s")`; and every
//            key of `dependencies`, `devDependencies`, `peerDependencies` and
//            `optionalDependencies` in every package.json the audit sees.
//   strings  the text of every string literal and of every literal piece of a
//            template (`https://host/${path}` is read as `https://host/`),
//            module specifiers excepted. Comments and regular-expression
//            literals are not strings and are never read.
//   names    every property-access name (`process.env.OPENAI_API_KEY`),
//            every element-access key written as a literal
//            (`env["OPENAI_API_KEY"]`), and every property a destructuring
//            pattern reads (`const { OPENAI_API_KEY } = process.env`).
//
// The holes, stated rather than hidden. The audit is syntactic: a host or key
// assembled at run time (`"api." + vendor + ".com"`, a computed element key)
// is not seen, nor is anything outside a script file or a package.json --
// HTML, JSON fixtures, shell scripts. It closes the honest mistake, not a
// determined one; the Lab's runtime network policy stays the backstop.
//
// A finding always fails: there is no baseline to hide one behind. A file that
// legitimately needs the reference is added to the entry's `allow` list in
// config.mjs, with a comment saying why.

export const id = "restricted-references";
export const title = "Restricted modules, strings and names appear only where allowed";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const MAX_SHOWN = 120;

function matches(patterns, text) {
  return (patterns ?? []).some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function isAllowed(entry, file) {
  return (entry.allow ?? []).some((allowed) => file === allowed || file.startsWith(`${allowed}/`));
}

function shown(text) {
  const flat = text.replace(/\s+/g, " ");
  return flat.length > MAX_SHOWN ? `${flat.slice(0, MAX_SHOWN)}...` : flat;
}

function literalText(ts, node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node : null;
}

// The module-specifier node of an import-like construct, or null.
function specifierOf(ts, node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return literalText(ts, node.moduleSpecifier);
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return literalText(ts, node.moduleReference.expression);
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
    const isRequire = ts.isIdentifier(callee) && callee.text === "require";
    if (isImport || isRequire) return literalText(ts, node.arguments[0]);
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return literalText(ts, node.argument.literal);
  return null;
}

// The property names a node reads, as [node, text] pairs.
function namesOf(ts, node) {
  if (ts.isPropertyAccessExpression(node)) return [[node.name, node.name.text]];
  if (ts.isElementAccessExpression(node)) {
    const key = literalText(ts, node.argumentExpression);
    return key ? [[key, key.text]] : [];
  }
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    const property = node.propertyName ?? node.name;
    if (ts.isIdentifier(property) || ts.isStringLiteral(property)) return [[property, property.text]];
  }
  return [];
}

// Every [kind, node, text] reference in one script file, with module
// specifiers kept out of the strings so one specifier is read once.
function scriptReferences(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const references = [];
  const specifiers = new Set();
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const visit = (node) => {
    const specifier = specifierOf(ts, node);
    if (specifier) {
      specifiers.add(specifier);
      references.push({ kind: "import", line: lineOf(specifier), text: specifier.text });
    }
    for (const [nameNode, text] of namesOf(ts, node)) references.push({ kind: "name", line: lineOf(nameNode), text });
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !specifiers.has(node)) {
      references.push({ kind: "string", line: lineOf(node), text: node.text });
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      references.push({ kind: "string", line: lineOf(node), text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

// Whether `quoted` (a JSON-quoted string) is written as a key on this line.
function isKeyOnLine(line, quoted) {
  for (let at = line.indexOf(quoted); at !== -1; at = line.indexOf(quoted, at + 1)) {
    if (line.slice(at + quoted.length).trimStart().startsWith(":")) return true;
  }
  return false;
}

// Every dependency key of a package.json, as an import reference at its line.
function manifestReferences(ctx, file) {
  const text = ctx.read(file);
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error(`restricted-references: ${file} is not valid JSON: ${error.message}`);
  }
  const lines = text.split("\n");
  const references = [];
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest?.[field];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const name of Object.keys(dependencies)) {
      const quoted = JSON.stringify(name);
      const index = lines.findIndex((line) => isKeyOnLine(line, quoted));
      references.push({ kind: "dependency", line: index === -1 ? 1 : index + 1, text: name, field });
    }
  }
  return references;
}

const KIND_FIELD = { import: "imports", dependency: "imports", string: "strings", name: "names" };
const KIND_LABEL = { import: "imports module", dependency: "declares dependency", string: "contains the string", name: "reads the name" };

export function run(ctx) {
  const entries = ctx.CONFIG.restrictedReferences ?? [];
  if (entries.length === 0) return [];

  const findings = [];
  const audit = (file, references) => {
    const applicable = entries.filter((entry) => !isAllowed(entry, file));
    if (applicable.length === 0) return;
    const seen = new Set();
    for (const reference of references(ctx, file)) {
      for (const entry of applicable) {
        if (!matches(entry[KIND_FIELD[reference.kind]], reference.text)) continue;
        // One finding per entry, line and text: `env["KEY"]` is both a name and
        // a string, and is reported once, as the name.
        const key = `${file}:${reference.line}:${entry.name}:${reference.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const where = reference.kind === "dependency" ? ` (${reference.field})` : "";
        findings.push({
          rule: id, key, value: 1, limit: 0, path: file, line: reference.line,
          message: `${file}:${reference.line}: ${KIND_LABEL[reference.kind]} "${shown(reference.text)}"${where}, a restricted ${entry.name} reference. ${entry.reason ?? "This reference is restricted in this repository."} ${entry.remedy ?? ""} If this file legitimately needs it, add it to the "${entry.name}" entry's allow list in scripts/structure-audit/config.mjs with a comment saying why.`.replace(/ {2,}/g, " "),
          severity: "fail", ratchet: false
        });
      }
    }
  };

  for (const file of ctx.scriptFiles) audit(ctx.normalize(file), scriptReferences);
  for (const file of ctx.files) {
    const normalized = ctx.normalize(file);
    if (ctx.basename(normalized) === "package.json") audit(normalized, manifestReferences);
  }
  return findings;
}
