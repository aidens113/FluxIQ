// One registry entry turned into absolute paths: the roots its fingerprint
// hashes, the outputs its digest covers, the files a reuse requires and where
// its stamp lives. Everything the cache decides is decided from this.
//
// Input roots of a package step, in the order they are labelled:
//   - the package's git-visible files, minus the step's outputs;
//   - every workspace package it depends on, transitively: its git-visible
//     files (sources, manifests and configs -- `transpilePackages` and the
//     tsconfig `paths` point the web app at `src`) and its ignored `dist/`,
//     which is what a NodeNext compile of a dependant reads;
//   - every script the command runs with `node <path>`;
//   - the repository's `package.json`, `pnpm-workspace.yaml`,
//     `pnpm-lock.yaml` and `tsconfig.base.json`;
//   - the build-cache sources, minus their tests, so a change to how a
//     fingerprint is taken invalidates every stamp taken the old way;
//   - the ignored paths the step names (`ignoredInputs`);
//   - the installed `node_modules/.pnpm/lock.yaml`, which with
//     `pnpm-lock.yaml` stands for every installed package: installed trees are
//     never walked.
// A repository step (`inputs: "repository"`) hashes every git-visible file of
// the checkout instead, plus the installed lockfile.
//
// Git-visible means tracked, or untracked and not ignored
// (`fingerprint/git-visible-files.mjs`), so the runtime data Core writes into
// ignored package directories never reaches a fingerprint.
//
// Labels are repository-relative paths, and an environment value that is an
// absolute path is fingerprinted relative to the repository, so the same
// inputs in two checkouts give the same fingerprint: that is what lets the
// shared store hand one tree's result to another. `relocationRoots` is the
// absolute directory an output must not mention to be stored for any tree.
//
// Stamps, locks and the stat cache live in `node_modules/.cache/fluxiq-core-build`.
// The downstream web-extension repository stamps its own layer over Core's
// library builds in `node_modules/.cache/fluxiq-build`; a shared directory would
// have each layer delete and rewrite the other's stamp on every run.

import path from "node:path";
import { REPOSITORY_ROOT } from "../repository-root.mjs";
import { STAMP_VERSION } from "../stamp/index.mjs";
import { STEPS } from "../steps.mjs";
import { readWorkspacePackages } from "./workspace-packages.mjs";

const REPOSITORY_FILES = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "tsconfig.base.json"];
const INSTALLED_LOCKFILE = "node_modules/.pnpm/lock.yaml";
const NODE_SCRIPT = /\bnode\s+(\S+\.m?js)\b/gu;
const CACHE_DIRECTORY = path.join("node_modules", ".cache", "fluxiq-core-build");
const STAT_CACHE_FILE = "stat-cache.json";

/**
 * @param {string} stepName a key of the registry, e.g. "fluxiq:build"
 * @param {{ repoRoot?: string, env?: NodeJS.ProcessEnv, steps?: Record<string, object> }} [options]
 */
export function resolveStep(stepName, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPOSITORY_ROOT);
  const env = options.env ?? process.env;
  const steps = options.steps ?? STEPS;
  const step = Object.hasOwn(steps, stepName) ? steps[stepName] : undefined;
  if (step === undefined) throw new Error(`build-cache: unknown step "${stepName}"; registered steps are ${Object.keys(steps).join(", ")}`);
  if (step.command.includes('"')) throw new Error(`build-cache: the command of "${stepName}" contains a double quote, which cannot pass through the package.json script as one argument`);

  const packageDir = path.join(repoRoot, step.package);
  const outputs = (step.outputs ?? []).map((output) => {
    const target = path.join(packageDir, output.path);
    return { label: label(repoRoot, target), path: target, exclude: (output.exclude ?? []).map((part) => path.join(target, part)), match: output.match ?? null };
  });

  const roots = [];
  const git = (target, exclude = []) => roots.push({ kind: "git", label: label(repoRoot, target), path: target, exclude });
  const walk = (target, extra = {}) => {
    const shown = label(repoRoot, target);
    roots.push({ kind: "walk", label: extra.name ? `${shown}/${extra.name}` : shown, path: target, exclude: [], match: extra.match ?? null, shallow: extra.shallow === true });
  };

  let dependencies = [];
  let packageName = null;
  if (step.inputs === "repository") {
    git(repoRoot);
  } else {
    const packages = readWorkspacePackages(repoRoot);
    const own = [...packages.values()].find((candidate) => samePath(candidate.dir, packageDir));
    if (own === undefined) throw new Error(`build-cache: "${stepName}" names ${step.package}, which is not a package of the workspace at ${repoRoot}`);
    git(
      packageDir,
      outputs.map((output) => output.path)
    );
    packageName = own.name;
    dependencies = transitiveDependencies(own, packages);
    for (const dependency of dependencies) {
      git(dependency.dir);
      walk(path.join(dependency.dir, "dist"));
    }
    for (const [, script] of step.command.matchAll(NODE_SCRIPT)) git(path.resolve(packageDir, script));
    for (const file of REPOSITORY_FILES) git(path.join(repoRoot, file));
    const cacheSources = path.join(repoRoot, "scripts", "build-cache");
    git(cacheSources, [path.join(cacheSources, "tests")]);
  }
  for (const input of step.ignoredInputs ?? []) walk(path.join(packageDir, input.path), input);
  walk(path.join(repoRoot, INSTALLED_LOCKFILE));

  const cacheDir = path.join(packageDir, CACHE_DIRECTORY);
  return {
    name: stepName,
    kind: step.kind,
    command: step.command,
    repoRoot,
    packageDir,
    packageName,
    dependencies: dependencies.map((dependency) => dependency.name),
    roots,
    outputs,
    required: (step.required ?? []).map((file) => path.join(packageDir, file)),
    tsconfigs: (step.tsconfigs ?? []).map((file) => path.join(packageDir, file)),
    traces: step.traces === true,
    replayOutput: step.replayOutput === true,
    stampPath: path.join(cacheDir, `${stepName.replaceAll(":", "-")}.json`),
    statCachePath: path.join(repoRoot, CACHE_DIRECTORY, STAT_CACHE_FILE),
    relocationRoots: [repoRoot],
    meta: {
      version: STAMP_VERSION,
      step: stepName,
      command: step.command,
      node: process.version,
      platform: process.platform,
      env: fingerprintedEnvironment(step, env, repoRoot),
      outputs: outputs.map((output) => ({ label: output.label, exclude: output.exclude.map((part) => label(repoRoot, part)), match: output.match?.source ?? null }))
    }
  };
}

/** The named variables and every variable with a named prefix, sorted, with absolute paths made repository-relative. */
function fingerprintedEnvironment(step, env, repoRoot) {
  const names = new Map();
  for (const name of step.env ?? []) names.set(name.toUpperCase(), name);
  const prefixes = (step.envPrefixes ?? []).map((prefix) => prefix.toUpperCase());
  for (const name of Object.keys(env)) {
    if (prefixes.some((prefix) => name.toUpperCase().startsWith(prefix))) names.set(name.toUpperCase(), name);
  }
  const shown = [...names.keys()].sort();
  return Object.fromEntries(shown.map((upper) => [names.get(upper), locationFree(readVariable(env, names.get(upper)), repoRoot)]));
}

/** A variable by name, case-insensitively on Windows, where the environment is. */
function readVariable(env, name) {
  if (Object.hasOwn(env, name)) return env[name] ?? null;
  if (process.platform !== "win32") return null;
  const found = Object.keys(env).find((candidate) => candidate.toUpperCase() === name.toUpperCase());
  return found === undefined ? null : (env[found] ?? null);
}

/**
 * An environment value as it is fingerprinted: an absolute path becomes the
 * path relative to the repository, so the same setting in two checkouts is
 * the same input; anything else is kept as it is.
 */
function locationFree(value, repoRoot) {
  if (typeof value !== "string" || value.trim() === "" || !path.isAbsolute(value.trim())) return value;
  return `<repository>/${label(repoRoot, path.resolve(value.trim()))}`;
}

function transitiveDependencies(own, packages) {
  const found = new Map();
  const pending = [...own.workspaceDeps];
  while (pending.length > 0) {
    const name = pending.pop();
    if (found.has(name) || name === own.name) continue;
    const dependency = packages.get(name);
    if (dependency === undefined) throw new Error(`build-cache: ${own.name} depends on workspace package ${name}, which the workspace does not contain`);
    found.set(name, dependency);
    pending.push(...dependency.workspaceDeps);
  }
  return [...found.values()].sort((left, right) => (left.dir < right.dir ? -1 : left.dir > right.dir ? 1 : 0));
}

function label(base, target) {
  const relative = path.relative(base, target);
  return (relative === "" ? "." : relative).split(path.sep).join("/");
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

