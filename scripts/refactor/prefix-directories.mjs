#!/usr/bin/env node
// Applies the audit's rule that a shared filename prefix becomes a directory, for
// groups the audit newly reports because a move made their path shallow enough.
// `dir/kept-a.ts` and `dir/kept-b.ts` become `dir/kept/a.ts` and `dir/kept/b.ts`
// behind a new barrel, and importers go through that barrel unless going through
// it would close a module cycle, which the imports rule also exempts.
//
//   node scripts/refactor/prefix-directories.mjs [--dry-run]

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyEdits, applyPlan, parse, planMoves, repositoryFiles } from "./move-owners.mjs";
import { createContext } from "../structure-audit/context.mjs";
import { buildRuntimeGraph, reachableModules } from "../structure-audit/import-graph/index.mjs";
import { run as runNaming } from "../structure-audit/rules/naming.mjs";

const posix = path.posix;
const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ts = createRequire(path.join(toolRoot, "packages/fluxiq/package.json"))("typescript");
const SOURCE_ROOT = "packages/fluxiq/src";
const SOURCE = /\.tsx?$/;
const isTest = (file) => /(?:^|\/)tests?\//.test(file);

// The members of one reported group: `prefix-*` files, and a file named just `prefix`.
export function groupMoves(directory, prefix, files) {
  const moves = [];
  for (const file of files) {
    if (posix.dirname(file) !== directory || !SOURCE.test(file) || isTest(file)) continue;
    const name = posix.basename(file);
    const extension = posix.extname(name);
    const stem = name.slice(0, -extension.length);
    if (stem === prefix) moves.push({ from: file, to: `${directory}/${prefix}/${name}` });
    else if (stem.startsWith(`${prefix}-`)) moves.push({ from: file, to: `${directory}/${prefix}/${stem.slice(prefix.length + 1)}${extension}` });
  }
  return moves;
}

function newGroups(root) {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, ".structure-baseline.json"), "utf8")).rules?.naming ?? {};
  return runNaming(createContext({ root }))
    .filter((finding) => finding.severity === "fail" && finding.key.includes("::") && !(finding.key in baseline))
    .map((finding) => {
      const [directory, prefix] = finding.key.split("::");
      return { directory, prefix };
    })
    .filter((group) => group.directory.startsWith(`${SOURCE_ROOT}/`));
}

function writeBarrels(root, groups) {
  const barrels = [];
  for (const { directory, prefix } of groups) {
    const folder = `${directory}/${prefix}`;
    const barrel = `${folder}/index.ts`;
    const absolute = path.join(root, barrel);
    const members = fs.readdirSync(path.join(root, folder)).filter((name) => SOURCE.test(name) && name !== "index.ts").sort();
    const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
    const lines = members.map((name) => `export * from "./${name}";`).filter((line) => !existing.includes(line));
    fs.writeFileSync(absolute, `${existing}${lines.join("\n")}\n`);
    barrels.push({ folder, barrel });
  }
  return barrels;
}

function resolveFile(from, specifier, present) {
  if (!specifier.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier)).replace(/\.(?:js|ts|tsx)$/, "");
  return [`${base}.ts`, `${base}.tsx`].find((candidate) => present.has(candidate)) ?? null;
}

// Imports and re-exports only. A `vi.mock` must keep naming the exact module it replaces.
function retargetThroughBarrels(root, barrels) {
  const ctx = createContext({ root });
  const graph = buildRuntimeGraph(ctx);
  const files = repositoryFiles(root);
  const present = new Set(files);
  const byFolder = new Map(barrels.map((entry) => [entry.folder, entry.barrel]));
  const reach = new Map();
  const leadsBack = (barrel, importer) => {
    if (!reach.has(barrel)) reach.set(barrel, reachableModules(graph, barrel));
    return reach.get(barrel).has(importer);
  };
  let rewritten = 0;
  let kept = 0;
  for (const file of files) {
    if (!SOURCE.test(file) || !file.startsWith(`${SOURCE_ROOT}/`)) continue;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (![...byFolder.keys()].some((folder) => text.includes(`${posix.basename(folder)}/`))) continue;
    const sourceFile = parse(file, text);
    const edits = [];
    for (const statement of sourceFile.statements) {
      const isImport = ts.isImportDeclaration(statement);
      if (!isImport && !ts.isExportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier) continue;
      const target = resolveFile(file, statement.moduleSpecifier.text, present);
      if (!target) continue;
      const folder = posix.dirname(target);
      const barrel = byFolder.get(folder);
      if (!barrel || posix.dirname(file) === folder || target === barrel) continue;
      const typeOnly = isImport ? statement.importClause?.isTypeOnly === true : statement.isTypeOnly === true;
      if (!typeOnly && leadsBack(barrel, file)) {
        kept += 1;
        continue;
      }
      const relative = posix.relative(posix.dirname(file), barrel);
      edits.push({ start: statement.moduleSpecifier.getStart(sourceFile) + 1, end: statement.moduleSpecifier.getEnd() - 1, value: relative.startsWith(".") ? relative : `./${relative}` });
    }
    if (edits.length === 0) continue;
    rewritten += edits.length;
    const after = applyEdits(text, edits);
    const seen = new Set();
    const deduped = after.split("\n").filter((line) => {
      if (!/^export \* from /.test(line.trim())) return true;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
    fs.writeFileSync(path.join(root, file), deduped.join("\n"));
  }
  return { rewritten, kept };
}

function main() {
  const root = toolRoot;
  const dryRun = process.argv.includes("--dry-run");
  const groups = newGroups(root);
  const files = repositoryFiles(root);
  const moves = groups.flatMap((group) => groupMoves(group.directory, group.prefix, files));
  const relative = (file) => file.slice(SOURCE_ROOT.length + 1);
  const options = { root, sourceRoot: SOURCE_ROOT, moves: moves.map((move) => ({ from: relative(move.from), to: relative(move.to) })) };
  const plan = planMoves(options);
  console.log(JSON.stringify({ groups: groups.length, ...plan.totals, problems: plan.problems.length }));
  plan.problems.slice(0, 30).forEach((problem) => console.error(problem));
  if (plan.problems.length > 0) process.exit(1);
  if (dryRun) {
    groups.forEach((group) => console.log(`  ${relative(group.directory)}/${group.prefix}/`));
    return;
  }
  fs.writeFileSync(path.join(root, "docs/working/studio-controller-plan/moves/03-prefix-directories.json"), `${JSON.stringify({ sourceRoot: SOURCE_ROOT, moves: options.moves }, null, 2)}\n`);
  applyPlan(options, plan);
  const barrels = writeBarrels(root, groups);
  console.log(JSON.stringify({ barrels: barrels.length, ...retargetThroughBarrels(root, barrels) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
