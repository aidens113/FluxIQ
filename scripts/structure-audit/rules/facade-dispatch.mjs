// A facade's public methods stay the dispatch point for code inside the object.
//
// When a class is decomposed into collaborators -- `x/service.ts` holding the
// facade and `x/service/` holding the pieces -- a method that moves into a
// collaborator keeps calling what it always called. If the callee is private
// that call can be re-pointed at whichever collaborator now owns it: a private
// method has no external dispatch contract. If the callee is still PUBLIC on
// the facade, re-pointing it is a silent behaviour change. A caller can
// subclass the service or replace a public method on an instance, and code
// inside the object is expected to honour that; routed straight at the owning
// collaborator the override is ignored. No type check sees it, and neither does
// a probe that compares return values, because the values are identical -- only
// the dispatch path changed.
//
// So: inside `x/service/`, a call to one of `x/service.ts`'s public methods must
// go through something that is not a collaborator -- a port object, or the
// facade itself. Calls to collaborators' own methods are untouched, which is the
// overwhelming majority of the traffic.

import path from "node:path";

export const id = "facade-dispatch";
export const title = "Collaborators call a facade's public methods through the facade";

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function stripExtension(file) {
  const extension = path.posix.extname(file);
  return SOURCE_EXTENSIONS.includes(extension) ? file.slice(0, -extension.length) : file;
}

// `x/service.ts` is a facade when `x/service/` also exists in the tree.
function facadeDirectories(ctx) {
  const directories = new Set();
  for (const file of ctx.trackedFiles) directories.add(ctx.dirname(file));
  const facades = new Map();
  for (const file of ctx.scriptFiles) {
    if (ctx.isTestFile(file)) continue;
    const withoutExtension = stripExtension(ctx.normalize(file));
    if (directories.has(withoutExtension)) facades.set(withoutExtension, file);
  }
  return facades;
}

function publicMethodNames(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !member.name) continue;
      const modifiers = ts.getModifiers(member) ?? [];
      if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword)) continue;
      if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)) continue;
      names.add(member.name.getText(sourceFile));
    }
  }
  return names;
}

// Every class the facade directory exports. A field typed as one of these holds
// a collaborator -- an implementation the caller could reach past. A field typed
// as an interface or type alias does not: that is a port, a contract the facade
// itself fulfils, and calling a public method through it is the whole point.
function collaboratorClasses(ctx, facadeDir) {
  const { ts } = ctx;
  const names = new Set();
  for (const file of ctx.scriptFiles) {
    const normalized = ctx.normalize(file);
    if (!normalized.startsWith(`${facadeDir}/`) || ctx.isTestFile(file)) continue;
    for (const statement of ctx.parse(file).statements) {
      if (ts.isClassDeclaration(statement) && statement.name) names.add(statement.name.text);
    }
  }
  return names;
}

// Which `this.<name>` fields hold one of those collaborators.
function collaboratorFields(ctx, file, fromFacade) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const fields = new Set();
  const typeNameOf = (node) => (node?.type && ts.isTypeReferenceNode(node.type) ? node.type.typeName.getText(sourceFile) : undefined);
  const consider = (name, node) => {
    const typeName = typeNameOf(node);
    if (name && typeName && fromFacade.has(typeName)) fields.add(name);
  };
  const visit = (node) => {
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) consider(node.name.text, node);
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) consider(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return fields;
}

export function run(ctx) {
  const { ts } = ctx;
  const findings = [];
  const facades = facadeDirectories(ctx);

  for (const [facadeDir, facadeFile] of facades) {
    const publicNames = publicMethodNames(ctx, facadeFile);
    if (!publicNames.size) continue;
    const classes = collaboratorClasses(ctx, facadeDir);

    for (const file of ctx.scriptFiles) {
      const normalized = ctx.normalize(file);
      if (!normalized.startsWith(`${facadeDir}/`) || ctx.isTestFile(file)) continue;
      const fields = collaboratorFields(ctx, file, classes);
      if (!fields.size) continue;

      const sourceFile = ctx.parse(file);
      const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const target = node.expression;
          const holder = target.expression;
          if (ts.isPropertyAccessExpression(holder)
            && holder.expression.kind === ts.SyntaxKind.ThisKeyword
            && fields.has(holder.name.text)
            && publicNames.has(target.name.text)) {
            const line = sourceFile.getLineAndCharacterOfPosition(target.getStart(sourceFile)).line + 1;
            findings.push({
              rule: id,
              key: `${normalized}:${line}`,
              value: 1,
              limit: 0,
              path: normalized,
              line,
              message: `${normalized}:${line}: calls this.${holder.name.text}.${target.name.text}(), a public method of ${facadeFile}. Call it through the facade (a port) so an override or stub on the public method is still honoured; only private methods may be re-pointed at the collaborator that owns them.`,
              severity: "fail",
              ratchet: false
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sourceFile, visit);
    }
  }

  return findings;
}
