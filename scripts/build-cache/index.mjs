// The build cache: content-fingerprinted stamp-and-skip for Core's package
// builds, the web build, every type check and the structure audit. A per-step
// lock keeps two processes from building one step in one tree at once, and a
// shared store (`store/`) keyed by the path-independent fingerprint lets a new
// worktree restore what another tree built. A step's inputs are the
// git-visible files it can read plus the ignored inputs it names, so runtime
// data in ignored directories never invalidates a build.
//
// `runStep` is what package scripts (through `cli.mjs`) call; `scheduleSteps`
// runs several, as the root `build` and `check` do; `decideStep` answers
// without building. The rest is what they are made of, exported for tests and
// the coverage proof (`prove-inputs.mjs`). Tests are never cached.

export { decideStep } from "./decide-step.mjs";
export { fingerprintStep } from "./fingerprint-step.mjs";
export { forEachLimited } from "./for-each-limited.mjs";
export { coversPath, digestFiles, gitVisibleFiles, listRootFiles, openStatCache, outputState } from "./fingerprint/index.mjs";
export { acquireStepLock, isProcessAlive } from "./lock/index.mjs";
export { REPOSITORY_ROOT } from "./repository-root.mjs";
export { runCommand } from "./run-command.mjs";
export { runStep } from "./run-step.mjs";
export { scheduleSteps } from "./schedule-steps.mjs";
export { readStamp, removeStamp, STAMP_VERSION, writeStamp } from "./stamp/index.mjs";
export { STEPS } from "./steps.mjs";
export {
  entryDirectory,
  findEmbeddedPath,
  pathSpellings,
  pruneStore,
  readEntry,
  restoreEntry,
  rootedEntryDirectory,
  saveEntry,
  storeDirectory
} from "./store/index.mjs";
export { touchStaleOutputs } from "./touch-stale-outputs.mjs";
export { findUnregisteredScripts, readWorkspacePackages, resolveStep, tsconfigReferences } from "./workspace/index.mjs";
