// node scripts/build-cache/prove-inputs.mjs [--json] [step ...]
//
// The coverage proof: every file a registered step's compiler actually loads
// is one its fingerprint hashes, or lies under an installed node_modules
// whose lockfile the fingerprint hashes. It asks the tools rather than the
// configs:
//   - `tsc -p <config> --listFilesOnly` for every project a step names, with
//     the package's own pinned compiler;
//   - for a step whose outputs carry Next's file traces (`traces`), every
//     `.next/**/*.nft.json` present after a build: each traced file must be
//     an input, an output of the same build, or installed;
//   - whatever else the repository lists for a step (`proofListings`, a
//     bundler's metafile in the downstream repository).
// Each listed file is resolved through symbolic links first, so a workspace
// package reached through node_modules counts as that package's files -- its
// `dist/` or `src/` -- and not as an installed dependency. Installed means
// under a node_modules of the checkout, or of another root the resolved step
// names in `installRoots` (a linked Core, whose installed lockfile it hashes).
// A file outside all of these fails the proof, naming the step and the file.
// A step with nothing to list (the structure audit reads git-visible files
// through `git ls-files` itself and runs no compiler) is reported as such.
// The cheap static counterpart that runs in `pnpm check` is each repository's
// tests/registry.test.mjs; this is the expensive one, run whenever the
// registry or a project's shape changes.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { listStepInputs } from "../fingerprint/index.mjs";
import { CORE_REPOSITORY, resolveFor } from "../repository/index.mjs";
import { listOutputFiles } from "../store/index.mjs";

/**
 * @param {string[]} argv `--json` and step names (none: every registered step)
 * @param {{ repository?: typeof CORE_REPOSITORY, stdout?: { write(text: string): unknown } }} [options]
 * @returns {Promise<number>} 0 when every listing is covered, 1 otherwise
 */
export async function proveInputs(argv, options = {}) {
  const repository = options.repository ?? CORE_REPOSITORY;
  const stdout = options.stdout ?? process.stdout;
  const asJson = argv.includes("--json");
  const only = argv.filter((argument) => argument !== "--json");
  for (const name of only) if (!Object.hasOwn(repository.steps, name)) throw new Error(`prove-inputs: unknown step "${name}"`);
  const listings = new Map();
  const results = [];
  const notes = [];

  for (const stepName of only.length > 0 ? only : Object.keys(repository.steps)) {
    const resolved = resolveFor(stepName, { repository });
    const extra = (await repository.proofListings?.(resolved)) ?? [];
    if (resolved.tsconfigs.length === 0 && !resolved.traces && extra.length === 0) {
      notes.push(`${stepName}: runs no compiler, nothing to list`);
      continue;
    }
    const context = { resolved, inputs: await inputSet(resolved), outputs: new Set((await listOutputFiles(resolved)).map((file) => key(file.path))) };
    for (const config of resolved.tsconfigs) {
      results.push(classify(stepName, `tsc ${path.relative(resolved.packageDir, config)}`, listProject(listings, resolved.packageDir, config), context));
    }
    if (resolved.traces) {
      const traces = traceFiles(resolved);
      if (traces.length === 0) notes.push(`${stepName}: no .nft.json traces present; build the step first to prove them`);
      const traced = new Set();
      for (const trace of traces) {
        for (const file of JSON.parse(readFileSync(trace, "utf8")).files ?? []) traced.add(path.resolve(path.dirname(trace), file));
      }
      if (traces.length > 0) results.push(classify(stepName, `${traces.length} nft traces`, [...traced], context));
    }
    for (const listing of extra) results.push(classify(stepName, listing.project, listing.files, context));
  }

  const failed = results.filter((result) => result.outside.length > 0);
  if (asJson) {
    stdout.write(`${JSON.stringify({ passed: failed.length === 0, results, notes }, null, 2)}\n`);
  } else {
    for (const result of results) {
      const counts = `${String(result.files).padStart(5)} files, ${String(result.inside).padStart(5)} fingerprinted, ${String(result.output).padStart(5)} own outputs, ${String(result.installed).padStart(5)} installed`;
      stdout.write(`${result.outside.length === 0 ? "ok  " : "FAIL"} ${result.step.padEnd(32)} ${result.project.padEnd(28)} ${counts}\n`);
      for (const file of result.outside.slice(0, 50)) stdout.write(`       outside every input root: ${file}\n`);
      if (result.outside.length > 50) stdout.write(`       ... and ${result.outside.length - 50} more\n`);
    }
    for (const note of notes) stdout.write(`note ${note}\n`);
    stdout.write(failed.length === 0 ? `inputs proved complete for ${results.length} listing(s)\n` : `${failed.length} listing(s) read files no fingerprint covers\n`);
  }
  return failed.length === 0 ? 0 : 1;
}

/** Every file the step's fingerprint hashes, by resolved path. */
async function inputSet(resolved) {
  const files = new Set();
  for (const file of await listStepInputs(resolved)) if (file.path !== null && existsSync(file.path)) files.add(key(real(file.path)));
  return files;
}

function listProject(listings, packageDir, config) {
  if (listings.has(config)) return listings.get(config);
  const compiler = createRequire(path.join(packageDir, "package.json")).resolve("typescript/lib/tsc.js");
  const run = spawnSync(process.execPath, [compiler, "-p", config, "--listFilesOnly"], { cwd: packageDir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`tsc --listFilesOnly -p ${config} exited ${run.status}:\n${run.stdout}${run.stderr}`);
  const files = run.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => path.resolve(line));
  listings.set(config, files);
  return files;
}

/** Next's file traces under the step's outputs, Next's own cache excluded. */
function traceFiles(resolved) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (resolved.outputs.some((output) => (output.exclude ?? []).some((excluded) => key(excluded) === key(target)))) continue;
      if (entry.isDirectory()) walk(target);
      else if (entry.name.endsWith(".nft.json")) found.push(target);
    }
  };
  for (const output of resolved.outputs) if (existsSync(output.path)) walk(output.path);
  return found;
}

function classify(step, project, files, { resolved, inputs, outputs }) {
  const result = { step, project, files: files.length, inside: 0, output: 0, installed: 0, outside: [] };
  const installRoots = (resolved.installRoots ?? [resolved.repoRoot]).map(key);
  for (const listed of files) {
    const file = existsSync(listed) ? real(listed) : path.resolve(listed);
    const id = key(file);
    if (inputs.has(id)) result.inside += 1;
    else if (outputs.has(id)) result.output += 1;
    // Installed under a root whose lockfiles the fingerprint hashes: its
    // store and each package's node_modules, all described by pnpm-lock.yaml
    // and the installed node_modules/.pnpm/lock.yaml.
    else if (installRoots.some((root) => id === root || id.startsWith(`${root}${path.sep}`)) && id.split(path.sep).includes("node_modules")) result.installed += 1;
    else result.outside.push(path.relative(resolved.repoRoot, file).split(path.sep).join("/"));
  }
  return result;
}

function real(file) {
  return realpathSync.native(file);
}

function key(target) {
  const resolved = path.resolve(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
