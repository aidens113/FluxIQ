#!/usr/bin/env node
// Deletes modules that only forward to one other module, pointing their
// importers at the real one. The earlier migrations left these behind as aliases;
// the only consumers are in this repository, so none needs to stay.
//
//   node scripts/refactor/retire-forwarding.mjs <directory>... [--dry-run]
//
// Directories are relative to packages/fluxiq/src. A module is left alone when it
// renames what it forwards, forwards from more than one module, is a directory's
// own barrel, is named by a package export, or is re-exported wholesale by a
// module that would then export more than it did.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyEdits, comparableTokens, parse, repositoryFiles, specifierLiterals } from "./move-owners.mjs";

const posix = path.posix;
const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ts = createRequire(path.join(toolRoot, "packages/fluxiq/package.json"))("typescript");
const CODE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SOURCE_FILE = /\.tsx?$/;
const isTest = (file) => /(?:^|\/)tests?\//.test(file);

function resolveModule(from, specifier, present) {
  if (!specifier.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier)).replace(/\.(?:js|ts|tsx)$/, "");
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (present.has(candidate)) return candidate;
  }
  return null;
}

// What a module forwards to, or null if it does anything else.
export function forwardingShape(file, text, present) {
  const sourceFile = parse(file, text);
  let target = null;
  let wholesale = false;
  let statements = 0;
  for (const statement of sourceFile.statements) {
    statements += 1;
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) return null;
    const to = resolveModule(file, statement.moduleSpecifier.text, present);
    if (!to || (target && target !== to)) return null;
    target = to;
    const clause = statement.exportClause;
    if (!clause) wholesale = true;
    else if (!ts.isNamedExports(clause)) return null;
    else if (clause.elements.some((element) => element.propertyName && element.propertyName.text !== element.name.text)) return null;
  }
  return statements > 0 ? { target, wholesale } : null;
}

export function planRetirement({ root, sourceRoot, directories }) {
  const files = repositoryFiles(root);
  const present = new Set(files);
  const roots = directories.map((directory) => posix.join(sourceRoot, directory));
  const texts = new Map();
  const read = (file) => {
    if (!texts.has(file)) texts.set(file, fs.readFileSync(path.join(root, file), "utf8"));
    return texts.get(file);
  };
  const publicFiles = publicEntryPoints(root, present, sourceRoot);

  const shapes = new Map();
  for (const file of files) {
    if (!SOURCE_FILE.test(file) || isTest(file)) continue;
    if (!roots.some((directory) => file.startsWith(`${directory}/`))) continue;
    const shape = forwardingShape(file, read(file), present);
    if (!shape) continue;
    const ownBarrel = posix.basename(file).startsWith("index.") && posix.dirname(shape.target).startsWith(posix.dirname(file));
    if (ownBarrel || publicFiles.has(file)) continue;
    shapes.set(file, shape);
  }

  // Everything that names each candidate, so a wholesale re-export of a narrower
  // forwarder can hold that forwarder back rather than widen its re-exporter.
  const consumers = [];
  for (const file of files) {
    if (!CODE_FILE.test(file) || !file.startsWith("packages/") && !file.startsWith("apps/")) continue;
    const text = read(file);
    if (!text.includes("/") || !text.includes(".")) continue;
    const sourceFile = parse(file, text);
    for (const literal of specifierLiterals(sourceFile)) {
      const to = resolveModule(file, literal.text, present);
      if (to && shapes.has(to)) consumers.push({ file, literal, to, sourceFile });
    }
  }
  const held = new Set();
  for (const { literal, to } of consumers) {
    const parent = literal.parent;
    if (ts.isExportDeclaration(parent) && !parent.exportClause && !shapes.get(to).wholesale) held.add(to);
  }
  for (const file of held) shapes.delete(file);

  const finalTarget = (file) => {
    let current = file;
    const seen = new Set();
    while (shapes.has(current) && !seen.has(current)) {
      seen.add(current);
      current = shapes.get(current).target;
    }
    return current;
  };

  const edits = new Map();
  for (const { file, literal, to, sourceFile } of consumers) {
    if (!shapes.has(to) || shapes.has(file)) continue;
    const relative = posix.relative(posix.dirname(file), finalTarget(to));
    const value = relative.startsWith(".") ? relative : `./${relative}`;
    edits.set(file, [...(edits.get(file) ?? []), { start: literal.getStart(sourceFile) + 1, end: literal.getEnd() - 1, value }]);
  }

  const problems = [];
  const writes = new Map();
  for (const [file, fileEdits] of edits) {
    const before = read(file);
    const after = applyEdits(before, fileEdits);
    if (comparableTokens(file, before).join("\0") !== comparableTokens(file, after).join("\0")) problems.push(`tokens changed in ${file}`);
    writes.set(file, after);
  }
  return { retired: [...shapes.keys()], held: [...held], writes, problems, finalTarget };
}

function publicEntryPoints(root, present, sourceRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "packages/fluxiq/package.json"), "utf8"));
  const found = new Set();
  const visit = (value) => {
    if (typeof value === "string") {
      const source = value.replace(/^\.\/dist\//, `${sourceRoot}/`).replace(/\.d\.ts$|\.js$/, ".ts");
      if (present.has(source)) found.add(source);
    } else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(manifest.exports);
  // Compiler paths and the audit's browser entries name modules the same way.
  for (const config of ["tsconfig.base.json", "scripts/structure-audit/config.mjs"]) {
    const configPath = path.join(root, config);
    if (!fs.existsSync(configPath)) continue;
    for (const match of fs.readFileSync(configPath, "utf8").matchAll(/packages\/fluxiq\/src\/[\w.\/-]+\.tsx?/g)) {
      if (present.has(match[0])) found.add(match[0]);
    }
  }
  return found;
}

export function applyRetirement({ root, sourceRoot }, plan) {
  for (const [file, text] of plan.writes) fs.writeFileSync(path.join(root, file), text);
  const stop = path.join(root, sourceRoot);
  for (const file of plan.retired) {
    fs.rmSync(path.join(root, file));
    for (let directory = path.dirname(path.join(root, file)); directory.length > stop.length && fs.existsSync(directory); directory = path.dirname(directory)) {
      if (fs.readdirSync(directory).length > 0) break;
      fs.rmdirSync(directory);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const directories = args.filter((arg) => !arg.startsWith("--"));
  const options = { root: toolRoot, sourceRoot: "packages/fluxiq/src", directories };
  let total = 0;
  for (let round = 1; round <= 8; round += 1) {
    const plan = planRetirement(options);
    console.log(JSON.stringify({ round, retired: plan.retired.length, held: plan.held.length, edited: plan.writes.size, problems: plan.problems.length }));
    plan.problems.slice(0, 20).forEach((problem) => console.error(problem));
    if (plan.problems.length > 0) process.exit(1);
    if (args.includes("--dry-run")) {
      plan.held.slice(0, 20).forEach((file) => console.log(`  held ${file}`));
      return;
    }
    if (plan.retired.length === 0) break;
    applyRetirement(options, plan);
    total += plan.retired.length;
  }
  console.log(`retired ${total} forwarding module(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
