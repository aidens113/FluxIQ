// The build steps a package's build needs, dependencies first: what
// `pnpm --filter <package>... build` runs, as registry names. A caller that
// runs builds in-process through `runStep` (the downstream Lab prelude) runs
// them in this order, so a dependency is built, or proved current, before
// anything that reads its output.
//
// Only a package's own `<dir>:build` step counts; a registry's other build
// steps of a package (`<dir>:<what>-build`) are not what `pnpm build` runs.

import path from "node:path";
import { CORE_REPOSITORY } from "./repository/index.mjs";
import { readWorkspacePackages } from "./workspace/index.mjs";

/**
 * @param {string} stepName a registered build step, e.g. "fluxiq:build"
 * @param {{ repository?: typeof CORE_REPOSITORY, repoRoot?: string, steps?: Record<string, { package: string, kind: string }> }} [options]
 * @returns {string[]} registered build steps, each after every step it depends on, ending with `stepName`
 */
export function buildOrder(stepName, options = {}) {
  const repository = options.repository ?? CORE_REPOSITORY;
  const repoRoot = path.resolve(options.repoRoot ?? repository.root);
  const steps = options.steps ?? repository.steps;
  if (steps[stepName]?.kind !== "build") throw new Error(`build-cache: "${stepName}" is not a registered build step`);
  const packages = [...readWorkspacePackages(repoRoot).values()];
  const packageOf = (dir) => path.relative(repoRoot, dir).split(path.sep).join("/") || ".";
  const buildStepOf = new Map(
    Object.entries(steps)
      .filter(([name, step]) => step.kind === "build" && name.endsWith(":build"))
      .map(([name, step]) => [step.package, name])
  );

  const ordered = [];
  const visiting = new Set();
  const done = new Set();
  function visit(pkg) {
    const relative = packageOf(pkg.dir);
    if (done.has(relative)) return;
    if (visiting.has(relative)) throw new Error(`build-cache: workspace dependency cycle through ${pkg.name}`);
    visiting.add(relative);
    for (const name of pkg.workspaceDeps) {
      const dependency = packages.find((candidate) => candidate.name === name);
      if (dependency === undefined) throw new Error(`build-cache: ${pkg.name} depends on ${name}, which the workspace does not contain`);
      visit(dependency);
    }
    visiting.delete(relative);
    done.add(relative);
    const step = buildStepOf.get(relative);
    if (step !== undefined) ordered.push(step);
  }
  const root = packages.find((candidate) => packageOf(candidate.dir) === steps[stepName].package);
  if (root === undefined) throw new Error(`build-cache: "${stepName}" names ${steps[stepName].package}, which is not a workspace package`);
  visit(root);
  return ordered;
}
