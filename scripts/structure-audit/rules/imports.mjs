// Imports stay inside their allowed graph. Three checks over every module
// specifier in every script file: specifiers matching CONFIG.forbiddenImports
// are banned outright; relative specifiers crossing a CONFIG.importBoundaries
// edge are banned outright; and relative specifiers that reach past another
// directory's index barrel into one of its files are counted per importer and
// ratcheted.

import path from "node:path";

export const id = "imports";
export const title = "Imports respect forbidden modules, directory boundaries, and barrels";

const STRIPPABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const BARREL_FILENAMES = ["index.ts", "index.tsx", "index.js", "index.mjs"];

function isRelative(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

// Every module specifier written as a string literal: `import x from "s"`,
// `import "s"`, `export ... from "s"`, `export * from "s"`, and `import("s")`.
function collectSpecifiers(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const specifiers = [];

  const record = (node) => {
    if (!node || !ts.isStringLiteralLike(node)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    specifiers.push({ text: node.text, line });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      record(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

// Resolve a relative specifier against the importing file's directory.
function resolveRelative(importerDir, specifier) {
  return path.posix.normalize(path.posix.join(importerDir, specifier));
}

function stripExtension(resolved) {
  const extension = path.posix.extname(resolved);
  return STRIPPABLE_EXTENSIONS.has(extension) ? resolved.slice(0, -extension.length) : resolved;
}

function barrelDirectories(ctx) {
  const dirs = new Set();
  for (const file of ctx.trackedFiles) {
    if (BARREL_FILENAMES.includes(ctx.basename(file))) dirs.add(ctx.dirname(file));
  }
  return dirs;
}

function trackedDirectories(ctx) {
  const dirs = new Set();
  for (const file of ctx.trackedFiles) {
    let dir = ctx.dirname(file);
    while (dir !== "." && dir !== "/" && !dirs.has(dir)) {
      dirs.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  return dirs;
}

export function run(ctx) {
  const { CONFIG } = ctx;
  const forbidden = CONFIG.forbiddenImports ?? [];
  const boundaries = CONFIG.importBoundaries ?? [];
  const barrels = barrelDirectories(ctx);
  const directories = trackedDirectories(ctx);
  const findings = [];

  for (const file of ctx.scriptFiles) {
    const importerDir = ctx.dirname(file);
    let skips = 0;
    let firstSkip = null;

    for (const { text, line } of collectSpecifiers(ctx, file)) {
      const rule = forbidden.find((entry) => entry.pattern.test(text));
      if (rule) {
        findings.push({
          rule: id, key: `${file}:${line}`, value: 1, limit: 0, path: file, line,
          message: `${file}:${line}: imports "${text}". ${rule.reason}`,
          severity: "fail", ratchet: false
        });
      }

      if (!isRelative(text)) continue;
      const resolved = resolveRelative(importerDir, text);

      for (const boundary of boundaries) {
        if (!file.startsWith(`${boundary.from}/`)) continue;
        if (!resolved.startsWith(`${boundary.to}/`)) continue;
        findings.push({
          rule: id, key: `${file}:${line}`, value: 1, limit: 0, path: file, line,
          message: `${file}:${line}: imports "${text}", which resolves under ${boundary.to}/. ${boundary.reason}`,
          severity: "fail", ratchet: false
        });
      }

      // A directory import already goes through that directory's entry point.
      const target = stripExtension(resolved);
      if (directories.has(target)) continue;

      const targetDir = path.posix.dirname(target);
      // A module may reach the files of a directory it lives inside. This
      // rule is about a consumer crossing into a directory it is outside of;
      // an importer nested within the target directory is already inside it,
      // so no barrel stands between them. That covers both shapes the
      // migration phases create by construction rather than by anyone
      // reaching somewhere new: a test under <dir>/tests/ importing its
      // subject, and a file in a prefix-derived <dir>/<group>/ importing its
      // parent's module. A sibling subdirectory is still a crossing and is
      // still counted.
      if (importerDir === targetDir || importerDir.startsWith(`${targetDir}/`)) continue;
      if (path.posix.basename(target) === "index") continue;
      if (!barrels.has(targetDir)) continue;

      skips += 1;
      firstSkip ??= { text, line };
    }

    if (skips > 0) {
      findings.push({
        rule: id, key: file, value: skips, limit: 0, path: file,
        message: `${file}: ${skips} import(s) reach into another directory's files instead of its barrel, e.g. "${firstSkip.text}" at line ${firstSkip.line}. Import from the directory (its index) instead.`,
        severity: "fail", ratchet: true
      });
    }
  }

  return findings;
}
