import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// A package's `test` script: `node ../../scripts/vitest-groups.mjs --groups=a,b [vitest args]`.
// It runs `vitest run` once per group, one after another, with `FLUXIQ_TEST_GROUP`
// naming the group, and forwards any further arguments (a path, `-t`) to every
// run. Every group runs even when an earlier one fails, so a sweep reports all of
// them, and the exit code is non-zero when any failed. The package's vitest config
// decides what a group contains (`packages/fluxiq/tests/test-groups.ts`).
//
// Why groups run in turn rather than side by side: a real-SQLite test starved by a
// full-concurrency run times out (docs/architecture/code-structure.md, Test groups).

/** Runs each group in order; resolves to the exit code the script should end with. */
export async function runVitestGroups({ groups, args = [], cwd = process.cwd(), env = process.env, run = runVitest, log = console.log }) {
  if (groups.length === 0) throw new Error("vitest-groups: name at least one group with --groups=<name>[,<name>]");
  const failed = [];
  for (const group of groups) {
    log(`\n[vitest-groups] ${group}: vitest run ${args.join(" ")}`.trimEnd());
    const code = await run({ args: ["run", "--passWithNoTests", ...args], cwd, env: { ...env, FLUXIQ_TEST_GROUP: group } });
    if (code !== 0) failed.push(`${group} (exit ${code})`);
  }
  log(failed.length === 0 ? `[vitest-groups] all groups passed: ${groups.join(", ")}` : `[vitest-groups] failed: ${failed.join(", ")}`);
  return failed.length === 0 ? 0 : 1;
}

/** Splits `--groups=a,b` out of the command line; everything else is vitest's. */
export function parseVitestGroupsArgs(argv) {
  const groups = [];
  const args = [];
  for (const arg of argv) {
    if (arg.startsWith("--groups=")) groups.push(...arg.slice("--groups=".length).split(",").filter(Boolean));
    else if (arg !== "--") args.push(arg);
  }
  return { groups, args };
}

function runVitest({ args, cwd, env }) {
  const cli = path.join(path.dirname(createRequire(path.join(cwd, "package.json")).resolve("vitest/package.json")), "vitest.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runVitestGroups(parseVitestGroupsArgs(process.argv.slice(2)));
}
