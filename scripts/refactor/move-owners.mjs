#!/usr/bin/env node
// Moves source trees to the area that owns them, changing nothing but paths.
//
// A move made this way cannot change behaviour: every moved or edited source
// file keeps the same tokens in the same order, and only its module specifiers
// and the paths it names differ. That is what lets a whole tree move in one
// commit instead of being compared declaration by declaration by hand, and
// `--verify` proves it afterwards from git, independently of the code that made
// the edits.
//
//   node scripts/refactor/move-owners.mjs <manifest.json> [--dry-run]
//   node scripts/refactor/move-owners.mjs <manifest.json> --verify <git-ref>
//
// A manifest names the moves, relative to its source root. Longest `from` wins,
// so `{ from: X, to: X }` keeps a path where it is inside a larger move.
// `mergeBarrel` lets a moved `index.ts` land on an existing barrel by appending.
//
//   { "sourceRoot": "packages/fluxiq/src", "downstream": "../!FluxIQWebExtension",
//     "moves": [{ "from": "programs/automation-studio/runtime/llm", "to": "runtime/agents" }] }

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const posix = path.posix;
const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ts = createRequire(path.join(toolRoot, "packages/fluxiq/package.json"))("typescript");

const CODE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEXT_FILE = /\.(?:json|md|yml|yaml|txt)$/;
const SKIPPED_PATH = /^(?:docs\/working\/|reports\/|test-runs\/|lab-slots\/|scripts\/refactor\/)|(?:^|\/)pnpm-lock\.yaml$/;
const MOCK_CALL = new Set(["mock", "doMock", "unmock", "doUnmock", "importActual", "importMock"]);

// A path to source or emitted output. Data folders (`.fluxiq/data/programs/...`)
// and panel routes (`/api/programs/...`) carry neither prefix and never match.
const PREFIXED_PATH = /(?<![\w.-])((?:packages\/fluxiq\/)?(?:src|dist)\/)(programs\/[\w.\/-]*[\w\/-])/g;
// A bare source path. Only ever applied to comments and prose, never to code.
const BARE_PATH = /(?<![\w.\/-])(programs\/automation-studio\/[\w.\/-]*[\w\/-])/g;
// Any source or emitted path, moved or not, for comparing two versions of a file.
const ANY_NAMED_PATH = /(?<![\w.-])((?:packages\/fluxiq\/)?(?:src|dist)\/)[\w.\/-]*[\w\/-]/g;

export function compileMoves(sourceRoot, moves) {
  const rules = moves
    .map((move) => ({ from: posix.join(sourceRoot, move.from), to: posix.join(sourceRoot, move.to), mergeBarrel: move.mergeBarrel === true }))
    .sort((a, b) => b.from.length - a.from.length);
  const apply = (file) => {
    for (const rule of rules) {
      if (file === rule.from) return rule.to;
      if (file.startsWith(`${rule.from}/`)) return rule.to + file.slice(rule.from.length);
    }
    return file;
  };
  return { rules, apply };
}

function repositoryFiles(root) {
  const listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return listed.split("\0").filter((file) => file && !SKIPPED_PATH.test(file) && fs.existsSync(path.join(root, file)));
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
}

// Every string literal whose value is a module path, including the test
// runner's mock calls and a `new URL("..", import.meta.url)` read of a sibling.
function specifierLiterals(sourceFile) {
  const found = [];
  const add = (node) => {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) found.push(node);
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) add(node.moduleSpecifier);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
      else if (ts.isIdentifier(callee) && callee.text === "require") add(node.arguments[0]);
      else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "vi" && MOCK_CALL.has(callee.name.text)) add(node.arguments[0]);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" && node.arguments?.length === 2 && node.arguments[1].getText(sourceFile) === "import.meta.url") {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function commentRanges(sourceFile) {
  const text = sourceFile.text;
  const seen = new Map();
  const record = (ranges) => {
    for (const range of ranges ?? []) seen.set(range.pos, range.end);
  };
  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      record(ts.getLeadingCommentRanges(text, node.getFullStart()));
      record(ts.getTrailingCommentRanges(text, node.getEnd()));
      return;
    }
    children.forEach(visit);
  };
  visit(sourceFile);
  return [...seen.entries()].map(([pos, end]) => ({ pos, end }));
}

function mappedSpecifier(specifier, fromOld, fromNew, moves) {
  if (!specifier.startsWith(".")) return specifier;
  const trailingSlash = specifier.endsWith("/") ? "/" : "";
  const targetOld = posix.normalize(posix.join(posix.dirname(fromOld), specifier)).replace(/\/$/, "");
  const targetNew = moves.apply(targetOld);
  if (fromOld === fromNew && targetOld === targetNew) return specifier;
  const relative = posix.relative(posix.dirname(fromNew), targetNew) || ".";
  return `${relative.startsWith(".") ? relative : `./${relative}`}${trailingSlash}`;
}

function mappedEmittedPath(rest, sourceRoot, moves) {
  const direct = moves.apply(posix.join(sourceRoot, rest));
  if (direct !== posix.join(sourceRoot, rest)) return direct.slice(sourceRoot.length + 1);
  const emitted = /\.(d\.ts|js|js\.map)$/.exec(rest);
  if (!emitted) return rest;
  const source = `${posix.join(sourceRoot, rest.slice(0, -emitted[0].length))}.ts`;
  const mapped = moves.apply(source);
  return mapped === source ? rest : `${mapped.slice(sourceRoot.length + 1, -3)}.${emitted[1]}`;
}

function pathEdits(text, range, pattern, moves, sourceRoot) {
  const edits = [];
  pattern.lastIndex = range.pos;
  for (let match = pattern.exec(text); match && match.index < range.end; match = pattern.exec(text)) {
    const rest = match[match.length - 1];
    const mapped = mappedEmittedPath(rest, sourceRoot, moves);
    if (mapped === rest) continue;
    const start = match.index + match[0].length - rest.length;
    edits.push({ start, end: start + rest.length, value: mapped });
  }
  return edits;
}

function applyEdits(text, edits) {
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (let index = 0; index < ordered.length; index += 1) {
    const edit = ordered[index];
    if (index > 0 && edit.end > ordered[index - 1].start) throw new Error(`overlapping edits at ${edit.start}`);
    out = out.slice(0, edit.start) + edit.value + out.slice(edit.end);
  }
  return out;
}

// The token stream a file compiles from, with the only tokens a move may change
// blanked. Two files with equal streams are the same program text.
export function comparableTokens(file, raw) {
  // Git stores LF and a Windows checkout holds CRLF, which only shows up as a
  // difference inside a multi-line string.
  const text = raw.replace(/\r\n/g, "\n");
  const sourceFile = parse(file, text);
  const blanked = new Set(specifierLiterals(sourceFile).map((node) => node.getStart(sourceFile)));
  const tokens = [];
  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(sourceFile);
    if (children.length > 0) {
      children.forEach(visit);
      return;
    }
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    const start = node.getStart(sourceFile);
    tokens.push(blanked.has(start) ? "<module>" : text.slice(start, node.getEnd()).replace(ANY_NAMED_PATH, "$1<path>"));
  };
  visit(sourceFile);
  return tokens;
}

function sameTokens(file, before, after, newFile = file) {
  const a = comparableTokens(file, before);
  const b = comparableTokens(newFile, after);
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function worthParsing(file, text, moved) {
  return moved || file.includes("programs/") || text.includes("programs/");
}

function rewriteCode(file, text, newFile, moves, sourceRoot, parseSpecifiers) {
  const edits = [];
  const counts = { specifiers: 0, paths: 0, comments: 0 };
  const sourceFile = parse(file, text);
  const literals = [];
  if (parseSpecifiers) {
    for (const literal of specifierLiterals(sourceFile)) {
      literals.push({ start: literal.getStart(sourceFile), end: literal.getEnd() });
      const mapped = mappedSpecifier(literal.text, file, newFile, moves);
      if (mapped === literal.text) continue;
      edits.push({ start: literal.getStart(sourceFile) + 1, end: literal.getEnd() - 1, value: mapped });
      counts.specifiers += 1;
    }
  }
  // A module specifier is already handled above, and its text is relative to
  // this file, so the same characters are never also treated as a named path.
  const prefixed = pathEdits(text, { pos: 0, end: text.length }, PREFIXED_PATH, moves, sourceRoot)
    .filter((edit) => !literals.some((literal) => edit.start >= literal.start && edit.end <= literal.end));
  counts.paths = prefixed.length;
  edits.push(...prefixed);
  if (text.includes("programs/automation-studio/")) {
    for (const range of commentRanges(sourceFile)) {
      const bare = pathEdits(text, range, BARE_PATH, moves, sourceRoot);
      counts.comments += bare.length;
      edits.push(...bare);
    }
  }
  return { text: edits.length > 0 ? applyEdits(text, edits) : text, counts };
}

function rewriteProse(text, moves, sourceRoot) {
  const whole = { pos: 0, end: text.length };
  const edits = [...pathEdits(text, whole, PREFIXED_PATH, moves, sourceRoot), ...pathEdits(text, whole, BARE_PATH, moves, sourceRoot)];
  return { text: edits.length > 0 ? applyEdits(text, edits) : text, changed: edits.length };
}

export function planMoves({ root, downstreamRoot, sourceRoot, moves: moveList }) {
  const moves = compileMoves(sourceRoot, moveList);
  const files = repositoryFiles(root);
  const present = new Set(files);
  const renames = new Map();
  const totals = { moved: 0, edited: 0, specifiers: 0, paths: 0, comments: 0, prose: 0 };
  const problems = [];
  const writes = new Map();
  const appends = new Map();

  for (const rule of moves.rules) {
    if (rule.from === rule.to) continue;
    const covered = files.some((file) => file === rule.from || file.startsWith(`${rule.from}/`));
    if (!covered) problems.push(`nothing to move at ${rule.from}`);
  }
  for (const file of files) {
    const target = moves.apply(file);
    if (target !== file) renames.set(file, target);
  }
  const targets = new Map();
  for (const [from, to] of renames) {
    if (targets.has(to)) problems.push(`two files move to ${to}: ${targets.get(to)} and ${from}`);
    targets.set(to, from);
    if (!present.has(to) || renames.has(to)) continue;
    const rule = moves.rules.find((candidate) => from === candidate.from || from.startsWith(`${candidate.from}/`));
    if (rule?.mergeBarrel && posix.basename(to) === "index.ts") appends.set(from, to);
    else problems.push(`${to} already exists; ${from} cannot move onto it`);
  }

  for (const file of files) {
    const newFile = renames.get(file) ?? file;
    const moved = newFile !== file;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (CODE_FILE.test(file)) {
      if (!worthParsing(file, text, moved)) continue;
      const result = rewriteCode(file, text, newFile, moves, sourceRoot, true);
      totals.specifiers += result.counts.specifiers;
      totals.paths += result.counts.paths;
      totals.comments += result.counts.comments;
      if (result.text !== text && !sameTokens(file, text, result.text, newFile)) problems.push(`tokens changed in ${file}`);
      if (result.text !== text || moved) writes.set(file, { to: newFile, text: result.text, changed: result.text !== text });
    } else if (TEXT_FILE.test(file)) {
      const result = rewriteProse(text, moves, sourceRoot);
      totals.prose += result.changed;
      if (result.text !== text || moved) writes.set(file, { to: newFile, text: result.text, changed: result.text !== text });
    } else if (moved) {
      writes.set(file, { to: newFile, text, changed: false });
    }
  }

  const downstreamWrites = new Map();
  if (downstreamRoot) {
    for (const file of repositoryFiles(downstreamRoot)) {
      const text = fs.readFileSync(path.join(downstreamRoot, file), "utf8");
      if (!text.includes("programs/")) continue;
      if (CODE_FILE.test(file)) {
        const result = rewriteCode(file, text, file, moves, sourceRoot, false);
        totals.paths += result.counts.paths;
        totals.comments += result.counts.comments;
        if (result.text !== text) downstreamWrites.set(file, result.text);
      } else if (TEXT_FILE.test(file)) {
        const result = rewriteProse(text, moves, sourceRoot);
        totals.prose += result.changed;
        if (result.text !== text) downstreamWrites.set(file, result.text);
      }
    }
  }
  totals.moved = renames.size;
  totals.edited = [...writes.values()].filter((write) => write.changed).length + downstreamWrites.size;
  return { totals, problems, writes, appends, renames, downstreamWrites, reverseEdges: reverseEdges(root, files, renames, moves, sourceRoot) };
}

// Imports that would still point back into a program after these moves. Each one
// is a file left behind that its new owner depends on, so a move set is not
// complete until this is empty for the code that left.
function reverseEdges(root, files, renames, moves, sourceRoot) {
  const programs = `${sourceRoot}/programs/`;
  const edges = [];
  for (const file of files) {
    if (!CODE_FILE.test(file) || !file.startsWith(`${sourceRoot}/`)) continue;
    const newFile = renames.get(file) ?? file;
    if (newFile.startsWith(programs)) continue;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (!worthParsing(file, text, newFile !== file)) continue;
    const sourceFile = parse(file, text);
    for (const literal of specifierLiterals(sourceFile)) {
      if (!literal.text.startsWith(".")) continue;
      const target = moves.apply(posix.normalize(posix.join(posix.dirname(file), literal.text)).replace(/\/$/, ""));
      if (target.startsWith(programs)) edges.push({ from: newFile, to: target });
    }
  }
  return edges;
}

export function applyPlan({ root, downstreamRoot, sourceRoot }, plan) {
  const touchedDirectories = new Set();
  for (const [file, write] of plan.writes) {
    const from = path.join(root, file);
    const to = path.join(root, write.to);
    if (plan.appends.has(file)) {
      const existing = fs.readFileSync(to, "utf8");
      fs.writeFileSync(to, `${existing.replace(/\s*$/, "\n")}${write.text}`);
      fs.rmSync(from);
    } else if (write.to === file) {
      fs.writeFileSync(from, write.text);
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.rmSync(from);
      fs.writeFileSync(to, write.text);
    }
    if (write.to !== file) touchedDirectories.add(path.dirname(from));
  }
  for (const [file, text] of plan.downstreamWrites) fs.writeFileSync(path.join(downstreamRoot, file), text);
  const stop = path.join(root, sourceRoot);
  for (const start of touchedDirectories) {
    for (let directory = start; directory.length > stop.length && fs.existsSync(directory); directory = path.dirname(directory)) {
      if (fs.readdirSync(directory).length > 0) break;
      fs.rmdirSync(directory);
    }
  }
}

// Proves a commit range changed only paths, reading both sides from scratch.
export function verifyAgainst({ root, sourceRoot, moves: moveList }, ref) {
  const moves = compileMoves(sourceRoot, moveList);
  const problems = [];
  let compared = 0;
  const show = (file) => execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const before = execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", ref], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).split("\0").filter(Boolean);
  const changed = new Set(execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", ref, "--"], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).split("\0").filter(Boolean));
  for (const file of before) {
    if (!CODE_FILE.test(file)) continue;
    const target = moves.apply(file);
    if (target === file && !changed.has(file)) continue;
    const absolute = path.join(root, target);
    if (!fs.existsSync(absolute)) {
      problems.push(`${file} is missing at ${target}`);
      continue;
    }
    compared += 1;
    if (!sameTokens(file, show(file), fs.readFileSync(absolute, "utf8"), target)) problems.push(`${file} -> ${target} changed more than paths`);
  }
  return { compared, problems };
}

function main() {
  const args = process.argv.slice(2);
  const manifestPath = args.find((arg) => !arg.startsWith("--") && args[args.indexOf(arg) - 1] !== "--verify");
  if (!manifestPath) throw new Error("usage: move-owners.mjs <manifest.json> [--dry-run] [--verify <git-ref>]");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const root = toolRoot;
  const downstreamRoot = manifest.downstream ? path.resolve(root, manifest.downstream) : undefined;
  const options = { root, downstreamRoot, sourceRoot: manifest.sourceRoot, moves: manifest.moves };
  const verify = args.indexOf("--verify");
  if (verify >= 0) {
    const result = verifyAgainst(options, args[verify + 1]);
    console.log(JSON.stringify({ compared: result.compared, problems: result.problems.length }));
    result.problems.slice(0, 40).forEach((problem) => console.error(problem));
    process.exit(result.problems.length > 0 ? 1 : 0);
  }
  const plan = planMoves(options);
  console.log(JSON.stringify(plan.totals));
  const left = new Map();
  for (const edge of plan.reverseEdges) left.set(edge.to, [...(left.get(edge.to) ?? []), edge.from]);
  console.log(`still imported from outside the programs: ${left.size} file(s), ${plan.reverseEdges.length} import(s)`);
  if (args.includes("--dry-run")) {
    [...left.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([target, from]) => console.log(`  ${String(from.length).padStart(4)} ${target}  <- ${from[0]}`));
  }
  if (plan.problems.length > 0) {
    plan.problems.slice(0, 60).forEach((problem) => console.error(problem));
    console.error(`${plan.problems.length} problem(s); nothing was changed.`);
    process.exit(1);
  }
  if (args.includes("--dry-run")) return;
  applyPlan(options, plan);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
