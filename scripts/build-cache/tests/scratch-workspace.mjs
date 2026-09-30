// A scratch git checkout shaped like Core: contracts <- fluxiq <- web, and
// contracts <- client-gateway-websocket, plus a repository-wide audit step.
//
// Each build appends its package's directory name to `runs.log` (ignored, so
// the log is no input) and writes its source plus every dependency's
// `dist/out.txt` into its own output, so a test can count what ran and see
// what each build read. The web build writes `.next/BUILD_ID`,
// `.next/server/page.txt` and `.next/cache/compiled.txt`, Next's own cache,
// which the step excludes. A package holding a file named `embed-path` writes
// its own absolute directory into its output, which makes it not relocatable.
// The audit prints two lines and fails when `audit-fails` exists at the root.
//
// `.gitignore` ignores what Core's does: build output, and the runtime data
// Core writes into package directories.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runStep } from "../index.mjs";

const BUILD_SCRIPT = `
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const name = path.basename(process.cwd());
appendFileSync(process.env.RUN_LOG, name + "\\n");
if (existsSync("fail")) process.exit(3);
if (existsSync("touch-input")) writeFileSync("src/during.txt", String(Date.now()));
if (process.env.SLOW_BUILD) { const until = Date.now() + Number(process.env.SLOW_BUILD); while (Date.now() < until); }
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const read = Object.keys(manifest.dependencies ?? {}).map((dep) => readFileSync(path.join("..", "..", "packages", dep.replace("@fluxiq/", ""), "dist", "out.txt"), "utf8"));
const out = name === "web" ? ".next" : "dist";
mkdirSync(out, { recursive: true });
const embedded = existsSync("embed-path") ? process.cwd() : "";
const body = readFileSync("src/main.txt", "utf8") + read.join("") + embedded;
if (name === "web") {
  mkdirSync(path.join(out, "server"), { recursive: true });
  mkdirSync(path.join(out, "cache"), { recursive: true });
  writeFileSync(path.join(out, "BUILD_ID"), "build-id");
  writeFileSync(path.join(out, "server", "page.txt"), body);
  writeFileSync(path.join(out, "cache", "compiled.txt"), String(Date.now()));
} else {
  writeFileSync(path.join(out, "out.txt"), body);
}
`;

const AUDIT_SCRIPT = `
import { appendFileSync, existsSync } from "node:fs";
appendFileSync(process.env.RUN_LOG, "audit\\n");
console.log("audit: warning one");
console.error("audit: warning two");
if (existsSync("audit-fails")) { console.log("audit: FAIL"); process.exit(1); }
console.log("audit: passed");
`;

const GITIGNORE = ["node_modules/", "dist/", ".next/", "runs.log", ".env*", "!.env.example", "storage/*", "packages/*/recordings/", "packages/*/storage/", ""].join("\n");

function library(dir) {
  return { package: `packages/${dir}`, kind: "build", command: "node build.mjs", outputs: [{ path: "dist" }], required: ["dist/out.txt"], env: ["NODE_ENV"] };
}

export const SCRATCH_STEPS = {
  "contracts:build": library("contracts"),
  "fluxiq:build": library("fluxiq"),
  "client-gateway-websocket:build": library("client-gateway-websocket"),
  "web:build": {
    package: "apps/web",
    kind: "build",
    command: "node build.mjs",
    outputs: [{ path: ".next", exclude: ["cache"] }],
    required: [".next/BUILD_ID"],
    ignoredInputs: [{ path: ".", match: /^\.env/u, shallow: true, name: ".env*" }],
    env: ["NODE_ENV"],
    envPrefixes: ["NEXT_"]
  },
  "fluxiq:check": { package: "packages/fluxiq", kind: "check", command: "node check.mjs", env: [] },
  "audit:check": { package: ".", kind: "check", inputs: "repository", command: "node audit.mjs", replayOutput: true, env: [] }
};

export const BUILD_ORDER = ["contracts:build", "fluxiq:build", "client-gateway-websocket:build", "web:build"];

/** Creates a scratch checkout under a fresh temporary directory, with git initialised; returns its root. */
export async function makeScratchWorkspace(prefix) {
  const repo = await mkdtemp(path.join(os.tmpdir(), prefix));
  const put = (relative, text) => putFile(repo, relative, text);
  await put(".gitignore", GITIGNORE);
  await put("pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n  - "packages/*"\n');
  await put("package.json", "{}\n");
  await put("audit.mjs", AUDIT_SCRIPT);
  const graph = [
    ["packages/contracts", "@fluxiq/contracts", {}],
    ["packages/fluxiq", "fluxiq", { "@fluxiq/contracts": "workspace:*" }],
    ["packages/client-gateway-websocket", "@fluxiq/client-gateway-websocket", { "@fluxiq/contracts": "workspace:*" }],
    ["apps/web", "@fluxiq/web", { fluxiq: "workspace:*" }]
  ];
  for (const [dir, name, dependencies] of graph) {
    await put(`${dir}/package.json`, JSON.stringify({ name, dependencies }));
    await put(`${dir}/src/main.txt`, `${name} source\n`);
    await put(`${dir}/build.mjs`, BUILD_SCRIPT);
  }
  await put("packages/fluxiq/check.mjs", "import { existsSync } from 'node:fs'; process.exit(existsSync('check-fails') ? 1 : 0);");
  execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
  return repo;
}

export async function putFile(root, relative, text) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** What ran in a scratch checkout, in order. */
export async function runsIn(repo) {
  const log = path.join(repo, "runs.log");
  if (!existsSync(log)) return [];
  return (await readFile(log, "utf8")).split("\n").filter(Boolean);
}

/** Runs a scratch step with the given store (a directory, or "off"). */
export function runScratch(repo, step, store, env = {}) {
  return runStep(step, {
    repoRoot: repo,
    steps: SCRATCH_STEPS,
    stdio: "ignore",
    env: { ...process.env, RUN_LOG: path.join(repo, "runs.log"), FLUXIQ_BUILD_FORCE: "", FLUXIQ_BUILD_CACHE_DIR: store, ...env }
  });
}

/** Runs the scratch build steps in dependency order; returns each outcome's `result` by step. */
export async function buildAll(repo, store, env = {}) {
  const results = {};
  for (const step of BUILD_ORDER) {
    const outcome = await runScratch(repo, step, store, env);
    if (outcome.exitCode !== 0) throw new Error(`${step} failed: ${outcome.reason}`);
    results[step] = outcome;
  }
  return results;
}
