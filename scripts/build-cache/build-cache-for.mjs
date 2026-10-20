// The build cache as one repository uses it: every engine function that
// works on a repository's steps, bound to that repository. A downstream
// repository imports Core's engine, passes its configuration here once
// (`repository/core-repository.mjs` describes the shape) and keeps only that
// configuration: its root, registry, resolver and store namespace. Callers may
// still pass `repoRoot` and `steps` to point a call at a scratch checkout, as
// tests do; the repository itself cannot be swapped per call.
//
// Functions that do not depend on a repository (the lock, the stat cache, the
// store's parts, path spellings) are the engine's ordinary exports.

import path from "node:path";
import { buildOrder } from "./build-order.mjs";
import { decideStep } from "./decide-step.mjs";
import { proveInputs, runCli } from "./entry/index.mjs";
import { fingerprintStep } from "./fingerprint-step.mjs";
import { resolveFor } from "./repository/index.mjs";
import { runStep } from "./run-step.mjs";
import { scheduleSteps } from "./schedule-steps.mjs";
import { storeDirectory } from "./store/index.mjs";
import { tsconfigReferences } from "./workspace/index.mjs";

/**
 * @param {typeof import("./repository/index.mjs").CORE_REPOSITORY} repository
 */
export function buildCacheFor(repository) {
  checkRepository(repository);
  const bound = (options = {}) => ({ ...options, repository });
  return Object.freeze({
    repository,
    resolveStep: (stepName, options) => resolveFor(stepName, bound(options)),
    fingerprintStep: (step, options) => fingerprintStep(step, bound(options)),
    decideStep: (step, options) => decideStep(step, bound(options)),
    runStep: (step, options) => runStep(step, bound(options)),
    scheduleSteps: (names, options) => scheduleSteps(names, bound(options)),
    buildOrder: (stepName, options) => buildOrder(stepName, bound(options)),
    storeDirectory: (env) => storeDirectory(env, repository.storeNamespace),
    tsconfigReferences: (configPath, options = {}) => tsconfigReferences(configPath, { repoRoot: repository.root, ...options }),
    runCli: (argv, options) => runCli(argv, bound(options)),
    proveInputs: (argv, options) => proveInputs(argv, bound(options))
  });
}

/** Refuses a configuration the engine would misread later, with what is wrong. */
function checkRepository(repository) {
  const name = typeof repository?.name === "string" ? repository.name : "the repository";
  const problems = [];
  if (typeof repository?.root !== "string" || !path.isAbsolute(repository.root)) problems.push("root is not an absolute path");
  if (repository?.steps === null || typeof repository?.steps !== "object") problems.push("steps is not a registry object");
  if (typeof repository?.resolveStep !== "function") problems.push("resolveStep is not a function");
  if (repository?.proofListings !== undefined && typeof repository.proofListings !== "function") problems.push("proofListings is not a function");
  try {
    storeDirectory({ FLUXIQ_BUILD_CACHE_DIR: "off" }, repository?.storeNamespace === undefined ? "" : repository.storeNamespace);
  } catch (error) {
    problems.push(error.message);
  }
  if (problems.length > 0) throw new Error(`build-cache: ${name} cannot be used as a build-cache repository: ${problems.join("; ")}`);
}
