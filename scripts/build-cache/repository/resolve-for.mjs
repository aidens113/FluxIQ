// A step as the engine works on it. A step already resolved passes through
// (a downstream repository resolves some steps itself, outside its registry);
// a name is resolved by the repository's own resolver, against the
// repository's root and registry unless the caller names others.

import { CORE_REPOSITORY } from "./core-repository.mjs";

/**
 * @param {string | object} step a registry name, or a step already resolved
 * @param {{ repository?: typeof CORE_REPOSITORY, repoRoot?: string, steps?: Record<string, object>, env?: NodeJS.ProcessEnv }} [options]
 */
export function resolveFor(step, options = {}) {
  if (typeof step !== "string") return step;
  const repository = options.repository ?? CORE_REPOSITORY;
  return repository.resolveStep(step, { env: options.env, repoRoot: options.repoRoot ?? repository.root, steps: options.steps ?? repository.steps });
}
