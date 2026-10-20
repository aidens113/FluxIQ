// Core as a repository of the build cache: this checkout, its registry
// (`steps.mjs`), its resolver (`workspace/resolve-step.mjs`) and its part of
// the shared store, `core/`. Every engine function that takes
// `options.repository` uses this one when it is left out, so Core's CLI, its
// package scripts and its tests run exactly as before.
//
// A repository is:
//   name            what it is called in an error
//   root            absolute path of the checkout; registry paths are relative
//                   to it
//   steps           the registry: step name -> entry, in whatever shape the
//                   resolver reads
//   resolveStep     (stepName, { repoRoot, steps, env }) -> a resolved step, in
//                   the shape `workspace/resolve-step.mjs` documents: what
//                   every other part of the engine decides from. `repoRoot` and
//                   `steps` arrive filled in (the repository's own unless a
//                   caller overrides them, as tests do).
//   storeNamespace  its directory in the shared store, or null for the top
//                   (`store/store-directory.mjs`)
//   proofListings   optional: (resolved) -> Promise<{ project, files }[]>, more
//                   file lists `prove-inputs` holds against the inputs, for
//                   tools besides tsc and Next's traces (a bundler)

import { REPOSITORY_ROOT } from "../repository-root.mjs";
import { STEPS } from "../steps.mjs";
import { resolveStep } from "../workspace/index.mjs";

export const CORE_REPOSITORY = Object.freeze({ name: "FluxIQ Core", root: REPOSITORY_ROOT, steps: STEPS, resolveStep, storeNamespace: "core" });
