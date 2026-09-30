// Every way a workspace package's `build` or `check` script can fall out of
// the root `pnpm build` or `pnpm check` without anything failing: a package
// that pnpm-workspace.yaml picks up but whose step is not registered, whose
// script calls its compiler directly instead of the cache CLI, or whose step
// the root script does not list. The root scripts no longer run
// `pnpm -r build` or `pnpm -r check`, so without this a new package's check
// would simply never run.
//
// A package script must be `node ../../scripts/build-cache/cli.mjs <dir>:<kind>
// -- "<command>"`, with `<dir>` the package's directory name; the root script
// of the same kind must name that step in one of its
// `node scripts/build-cache/cli.mjs ...` calls.

import { readFileSync } from "node:fs";
import path from "node:path";
import { readWorkspacePackages } from "./workspace-packages.mjs";

const PACKAGE_CALL = /^node \.\.\/\.\.\/scripts\/build-cache\/cli\.mjs (\S+) -- "[^"]*"$/u;
const ROOT_CALL = /node scripts\/build-cache\/cli\.mjs((?: \S+)+?)(?= &&|$)/gu;
const KINDS = ["build", "check"];

/**
 * @param {string} workspaceRoot
 * @param {Record<string, { package: string, kind: string }>} steps the registry
 * @returns {string[]} one line per problem; empty when every package script is registered, cached and listed
 */
export function findUnregisteredScripts(workspaceRoot, steps) {
  const rootScripts = readScripts(workspaceRoot);
  const listed = Object.fromEntries(KINDS.map((kind) => [kind, rootSteps(rootScripts[kind])]));
  const problems = [];
  for (const pkg of readWorkspacePackages(workspaceRoot).values()) {
    const where = path.relative(workspaceRoot, pkg.dir).split(path.sep).join("/");
    const scripts = readScripts(pkg.dir);
    for (const kind of KINDS) {
      if (typeof scripts[kind] !== "string") continue;
      const expected = `${path.basename(pkg.dir)}:${kind}`;
      if (!Object.hasOwn(steps, expected) || steps[expected].package !== where || steps[expected].kind !== kind) {
        problems.push(`${where} has a ${kind} script, but ${expected} is not registered for it in scripts/build-cache/steps.mjs`);
      }
      const call = PACKAGE_CALL.exec(scripts[kind]);
      if (call === null || call[1] !== expected) problems.push(`${where} ${kind} does not run ${expected} through the build-cache CLI: ${scripts[kind]}`);
      if (!listed[kind].has(expected)) problems.push(`the root ${kind} script does not list ${expected}, so pnpm ${kind} never runs it`);
    }
  }
  return problems;
}

function readScripts(dir) {
  return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).scripts ?? {};
}

/** The step names the root script passes to the cache CLI, across all its calls. */
function rootSteps(script) {
  if (typeof script !== "string") return new Set();
  return new Set([...script.matchAll(ROOT_CALL)].flatMap((call) => call[1].trim().split(" ").filter((arg) => !arg.startsWith("--"))));
}
