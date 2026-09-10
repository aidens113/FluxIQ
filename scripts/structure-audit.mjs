#!/usr/bin/env node
// Structure audit: enforces file size, directory density, and class size
// budgets across tracked source files.
//
// The budgets are ratcheted, not absolute. Files and directories that
// already exceed a limit are recorded in .structure-baseline.json and may
// never grow beyond their recorded value, but they may shrink freely. New
// files and directories must satisfy the limit outright. This lets the
// codebase stop degrading immediately without requiring a large refactor
// first.
//
// Usage:
//   node scripts/structure-audit.mjs            check, exit non-zero on failure
//   node scripts/structure-audit.mjs --update   rewrite the baseline downward
//   node scripts/structure-audit.mjs --json     machine-readable report

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repoRoot, ".structure-baseline.json");

export const LIMITS = {
  // Hard ceiling for any file not present in the baseline.
  fileLines: 800,
  // Advisory: a module drifting past this is worth splitting before it
  // becomes expensive to split.
  fileLinesWarn: 400,
  // Hard ceiling on direct child files in a directory not in the baseline.
  directoryFiles: 25,
  directoryFilesWarn: 15,
  // Advisory only. The method count is a regex heuristic, not a parse, so
  // it must never block a build on its own.
  classMethods: 40,
  classMethodsWarn: 25
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);

const EXCLUDED_SEGMENTS = [
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  "docs/generated",
  ".test-build",
  ".script-build"
];

const EXCLUDED_PATTERNS = [/-snapshots\//, /\.d\.ts$/];

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  return out.split("\0").filter(Boolean);
}

function isAudited(file) {
  if (!SOURCE_EXTENSIONS.has(path.extname(file))) return false;
  const normalized = file.replaceAll("\\", "/");
  if (EXCLUDED_SEGMENTS.some((segment) => normalized.split("/").includes(segment) || normalized.startsWith(`${segment}/`))) {
    return false;
  }
  if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return true;
}

function countLines(absolute) {
  const text = readFileSync(absolute, "utf8");
  if (text === "") return 0;
  const lines = text.split("\n");
  // A trailing newline should not count as an extra line.
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

// Heuristic class-size scan. Tracks brace depth from each `class X {` and
// counts method-signature-looking lines at the class body's own depth.
// Deliberately advisory: a regex cannot know TypeScript.
function scanClasses(text) {
  const lines = text.split("\n");
  const found = [];
  let current = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const classMatch = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/.exec(line);

    if (classMatch && current === null) {
      current = { name: classMatch[1], line: i + 1, methods: 0, openDepth: depth };
    }

    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    if (current !== null && depth === current.openDepth + 1) {
      if (/^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(?:\*\s*)?[A-Za-z_$][A-Za-z0-9_$]*\s*(?:<[^>]*>)?\s*\([^)]*\)\s*[:{]/.test(line)
        && !/^\s*(?:if|for|while|switch|catch|return|typeof)\b/.test(line)) {
        current.methods += 1;
      }
    }

    depth += opens - closes;

    if (current !== null && depth <= current.openDepth && (opens > 0 || closes > 0)) {
      found.push(current);
      current = null;
    }
  }

  if (current !== null) found.push(current);
  return found;
}

function loadBaseline() {
  if (!existsSync(baselinePath)) return { files: {}, directories: {} };
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8"));
  return { files: parsed.files ?? {}, directories: parsed.directories ?? {} };
}

function audit() {
  const baseline = loadBaseline();
  const files = trackedFiles().filter(isAudited);

  const errors = [];
  const warnings = [];
  const ratchetable = [];
  const measuredFiles = {};
  const measuredDirectories = {};

  for (const file of files) {
    const absolute = path.join(repoRoot, file);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;

    const lines = countLines(absolute);
    measuredFiles[file] = lines;

    const allowed = baseline.files[file];

    if (allowed === undefined) {
      if (lines > LIMITS.fileLines) {
        errors.push(`${file}: ${lines} lines exceeds the ${LIMITS.fileLines}-line limit for new files. Split it, or add a justified baseline entry.`);
      } else if (lines > LIMITS.fileLinesWarn) {
        warnings.push(`${file}: ${lines} lines is past the ${LIMITS.fileLinesWarn}-line advisory threshold.`);
      }
    } else if (lines > allowed) {
      errors.push(`${file}: ${lines} lines exceeds its baseline of ${allowed}. Baselined files may shrink, never grow.`);
    } else if (lines < allowed) {
      ratchetable.push(`${file}: ${allowed} -> ${lines}`);
    }

    if (path.extname(file) !== ".css") {
      const text = readFileSync(absolute, "utf8");
      for (const found of scanClasses(text)) {
        if (found.methods > LIMITS.classMethods) {
          warnings.push(`${file}:${found.line}: class ${found.name} has roughly ${found.methods} methods, past the ${LIMITS.classMethods}-method guideline.`);
        } else if (found.methods > LIMITS.classMethodsWarn) {
          warnings.push(`${file}:${found.line}: class ${found.name} has roughly ${found.methods} methods, approaching the ${LIMITS.classMethods}-method guideline.`);
        }
      }
    }
  }

  for (const file of files) {
    const directory = path.dirname(file).replaceAll("\\", "/");
    measuredDirectories[directory] = (measuredDirectories[directory] ?? 0) + 1;
  }

  for (const [directory, count] of Object.entries(measuredDirectories)) {
    const allowed = baseline.directories[directory];
    if (allowed === undefined) {
      if (count > LIMITS.directoryFiles) {
        errors.push(`${directory}/: ${count} source files exceeds the ${LIMITS.directoryFiles}-file limit for new directories. Group them into subdirectories.`);
      } else if (count > LIMITS.directoryFilesWarn) {
        warnings.push(`${directory}/: ${count} source files is past the ${LIMITS.directoryFilesWarn}-file advisory threshold.`);
      }
    } else if (count > allowed) {
      errors.push(`${directory}/: ${count} source files exceeds its baseline of ${allowed}.`);
    } else if (count < allowed) {
      ratchetable.push(`${directory}/: ${allowed} -> ${count}`);
    }
  }

  return { errors, warnings, ratchetable, measuredFiles, measuredDirectories };
}

function writeBaseline({ measuredFiles, measuredDirectories }) {
  const previous = loadBaseline();
  const files = {};
  const directories = {};

  // Only record entries that actually exceed a limit, and never raise an
  // existing entry.
  for (const [file, lines] of Object.entries(measuredFiles)) {
    const prior = previous.files[file];
    if (lines > LIMITS.fileLines || prior !== undefined) {
      const value = prior === undefined ? lines : Math.min(prior, lines);
      if (value > LIMITS.fileLines) files[file] = value;
    }
  }

  for (const [directory, count] of Object.entries(measuredDirectories)) {
    const prior = previous.directories[directory];
    if (count > LIMITS.directoryFiles || prior !== undefined) {
      const value = prior === undefined ? count : Math.min(prior, count);
      if (value > LIMITS.directoryFiles) directories[directory] = value;
    }
  }

  const sortByValueDescending = (entries) =>
    Object.fromEntries(entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

  const payload = {
    comment: "Ratcheted structure budgets. Entries may only be lowered, never raised. Regenerate with: pnpm structure:baseline",
    limits: LIMITS,
    files: sortByValueDescending(Object.entries(files)),
    directories: sortByValueDescending(Object.entries(directories))
  };

  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

const args = new Set(process.argv.slice(2));
const result = audit();

if (args.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

if (args.has("--update")) {
  const payload = writeBaseline(result);
  const fileCount = Object.keys(payload.files).length;
  const directoryCount = Object.keys(payload.directories).length;
  console.log(`structure-audit: baseline written with ${fileCount} file entries and ${directoryCount} directory entries.`);
  process.exit(0);
}

for (const warning of result.warnings) console.warn(`  warn  ${warning}`);
for (const error of result.errors) console.error(`  FAIL  ${error}`);

if (result.ratchetable.length > 0) {
  console.log(`\nstructure-audit: ${result.ratchetable.length} baseline entries can be lowered. Run "pnpm structure:baseline" to record the improvement.`);
}

if (result.errors.length > 0) {
  console.error(`\nstructure-audit: ${result.errors.length} violation(s).`);
  process.exit(1);
}

console.log(`structure-audit: passed (${result.warnings.length} warning(s)).`);
