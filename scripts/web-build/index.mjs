// Keyed production builds of the web panel: `prepareWebBuild` builds a Core
// checkout's panel into an immutable directory keyed by Core's `web:build`
// fingerprint, once per key under a create-only lock, publishes it
// atomically, and hands every later caller the same build to serve with
// `next start`; `inspectWebBuild` answers what it would do without doing it.
//
// For servers that must run side by side while Core changes -- a downstream
// repository's test Lab, a persistent demo -- where `web:build`'s in-place
// `apps/web/.next` would be rebuilt under them. The rest is what the two are
// made of, exported for tests and for callers that check a build themselves.
// `identity/check-web-build.mjs` is the last command of `web:build` itself.

export { assertStampedRuntimeIdentity } from "./identity/index.mjs";
export { inspectWebBuild } from "./inspect-web-build.mjs";
export { insideNodeModules, webBuildCacheRoot, webBuildPathBudget } from "./location/index.mjs";
export { isolatedBuildEnvironment } from "./build-environment.mjs";
export { markBuildComplete, newBuildAttemptName, publishBuildAttempt, readPublishedBuild } from "./publication/index.mjs";
export { prepareWebBuild } from "./prepare-web-build.mjs";
export { runWebBuildCommand } from "./run-web-build-command.mjs";
export { webBuildError } from "./web-build-error.mjs";
export { webBuildKey } from "./web-build-key.mjs";
