// Shared context for structure-audit rules: the tracked file set, cached
// file reads and TypeScript parses, limits, and repository configuration.
//
// Rule contract. Each file in ./rules/ exports:
//   export const id = "kebab-rule-id";
//   export const title = "One-line description of what the rule holds";
//   export function run(ctx) { return findings; }
//   export function update(ctx) {}   // optional; called by --update after the
//                                     // baseline is written (e.g. regenerate a
//                                     // derived file)
//
// A finding is:
//   {
//     key: string,        // stable identity for the ratchet, e.g. a path,
//                         // "dir::prefix", or "path::ClassName"
//     value: number,      // the measured quantity
//     limit: number,      // the limit it is compared against
//     path: string,       // repo-relative path shown to the user
//     line?: number,      // 1-based, when the finding is at a line
//     message: string,    // self-explanatory without opening any docs
//     severity: "fail" | "warn",
//     ratchet: boolean    // fail findings with ratchet:true are suppressed
//                         // while value <= the baselined value for key;
//                         // ratchet:false fail findings always fail
//   }
//
// Rules must be pure with respect to the repository: read only, no writes
// outside update().

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { CONFIG } from "./config.mjs";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const LIMITS = {
  fileLines: 800,
  fileLinesWarn: 400,
  directoryFiles: 25,
  directoryFilesWarn: 15,
  classMethods: 40,
  classMethodsWarn: 25,
  exportedValues: 15,
  exportedValuesWarn: 8,
  exportedClasses: 1,
  exportedComponents: 1,
  prefixGroup: 3,
  maxPathSegments: 9,
  workingDocLines: 800,
  workingDocCurrentStateLines: 150
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);
const SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const EXCLUDED_SEGMENTS = new Set(["node_modules", "dist", "build", ".next", "coverage", ".test-build", ".script-build"]);
const EXCLUDED_PATTERNS = [/-snapshots\//, /\.d\.ts$/, /^docs\/generated\//];

export function normalize(file) {
  return file.replaceAll("\\", "/");
}

export function isSourceFile(file) {
  const normalized = normalize(file);
  if (!SOURCE_EXTENSIONS.has(path.posix.extname(normalized))) return false;
  if (normalized.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;
  return !EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isScriptFile(file) {
  return isSourceFile(file) && SCRIPT_EXTENSIONS.has(path.posix.extname(normalize(file)));
}

export function isTestFile(file) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalize(file));
}

function scriptKindFor(file) {
  switch (path.posix.extname(file)) {
    case ".tsx": return ts.ScriptKind.TSX;
    case ".jsx": return ts.ScriptKind.JSX;
    case ".js": case ".mjs": case ".cjs": return ts.ScriptKind.JS;
    default: return ts.ScriptKind.TS;
  }
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter(Boolean).map(normalize).filter((file) => {
    const absolute = path.join(repoRoot, file);
    return existsSync(absolute) && statSync(absolute).isFile();
  });
}

export function createContext() {
  const tracked = trackedFiles();
  const textCache = new Map();
  const astCache = new Map();

  const read = (file) => {
    const key = normalize(file);
    if (!textCache.has(key)) textCache.set(key, readFileSync(path.join(repoRoot, key), "utf8"));
    return textCache.get(key);
  };

  const lineCount = (file) => {
    const text = read(file);
    if (text === "") return 0;
    const lines = text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines.length;
  };

  const parse = (file) => {
    const key = normalize(file);
    if (!astCache.has(key)) {
      astCache.set(key, ts.createSourceFile(key, read(key), ts.ScriptTarget.Latest, true, scriptKindFor(key)));
    }
    return astCache.get(key);
  };

  return {
    repoRoot,
    LIMITS,
    CONFIG,
    ts,
    trackedFiles: tracked,
    sourceFiles: tracked.filter(isSourceFile),
    scriptFiles: tracked.filter(isScriptFile),
    isSourceFile,
    isScriptFile,
    isTestFile,
    normalize,
    read,
    lineCount,
    parse,
    dirname: (file) => path.posix.dirname(normalize(file)),
    basename: (file) => path.posix.basename(normalize(file)),
    extname: (file) => path.posix.extname(normalize(file))
  };
}
