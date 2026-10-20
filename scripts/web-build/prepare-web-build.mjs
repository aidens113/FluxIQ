// The production build of a Core checkout's web panel for its current
// inputs, built once per key and served read-only by any number of
// `next start` processes while another key builds elsewhere.
//
// The key is Core's `web:build` fingerprint (`web-build-key.mjs`). Each key
// has a directory under the cache root; one caller takes the key's
// create-only lock and builds an attempt (`build-attempt.mjs`), the rest wait
// for the lock and then find the publication. A published attempt is never
// rewritten, so a server keeps serving it however many newer keys are built.
//
// Unlike `pnpm --filter @fluxiq/web build`, which builds `apps/web/.next` in
// place for one server at a time, this stages a snapshot of the panel, so
// neither an edit to the checkout nor another build disturbs a running server.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { REPOSITORY_ROOT } from "../build-cache/index.mjs";
import { acquireBuildLock } from "./acquire-build-lock.mjs";
import { buildAttempt } from "./build-attempt.mjs";
import { ensureGatewayArtifact, gatewayCopyMatches } from "./gateway/index.mjs";
import { assertStampedRuntimeIdentity } from "./identity/index.mjs";
import { insideNodeModules, webBuildCacheRoot, webBuildPathBudget } from "./location/index.mjs";
import { nextExecutable } from "./next-executable.mjs";
import { readPublishedBuild } from "./publication/index.mjs";
import { runWebBuildCommand } from "./run-web-build-command.mjs";
import { stageWorkspace } from "./staging/index.mjs";
import { webBuildError } from "./web-build-error.mjs";
import { webBuildKey } from "./web-build-key.mjs";

const LOCK_FILE = "build.lock";

const DEFAULTS = Object.freeze({
  ensureGateway: ensureGatewayArtifact,
  key: (repoRoot, env) => webBuildKey(repoRoot, { env }),
  stage: stageWorkspace,
  gatewayCopyMatches,
  assertIdentity: assertStampedRuntimeIdentity,
  pathBudget: (cacheRoot) => webBuildPathBudget(cacheRoot),
  lock: {}
});

/**
 * @typedef {{ name: "gateway-server-build" | "web-build", command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, shell: boolean }} WebBuildCommand
 * @typedef {{ key: string, directory: string, webDirectory: string, buildId: string, nextExecutable: string, reused: boolean }} WebBuild
 */

/**
 * @param {{
 *   repoRoot?: string,
 *   cacheRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 *   run?: (command: WebBuildCommand) => Promise<void>,
 *   log?: (line: string) => void,
 *   signal?: AbortSignal,
 *   waitTimeoutMs?: number
 * }} [options] `repoRoot` defaults to this Core; `env` is the base environment of every command and of the key
 * @param {Partial<typeof DEFAULTS>} [overrides] collaborators, replaced only by tests
 * @returns {Promise<WebBuild>} `reused` is false only for the caller that built it
 */
export async function prepareWebBuild(options = {}, overrides = {}) {
  const dependencies = { ...DEFAULTS, ...overrides };
  const repoRoot = path.resolve(options.repoRoot ?? REPOSITORY_ROOT);
  const env = options.env ?? process.env;
  const run = options.run ?? runWebBuildCommand;
  const log = options.log ?? (() => {});
  // Asked before Core is read: a cache root that cannot hold a build is
  // answered in a sentence, not as a Turbopack error minutes into a build.
  const cacheRoot = options.cacheRoot ? path.resolve(options.cacheRoot) : webBuildCacheRoot(repoRoot, env);
  checkCacheRoot(cacheRoot, repoRoot, dependencies.pathBudget);
  options.signal?.throwIfAborted();

  await dependencies.ensureGateway(repoRoot, { run, env, log });
  const { key } = await dependencies.key(repoRoot, env);
  const keyDirectory = path.join(cacheRoot, key);
  await mkdir(keyDirectory, { recursive: true });
  const served = (build, reused) => ({ ...build, nextExecutable: nextExecutable(repoRoot), reused });
  const reusable = async () => {
    const published = await readPublishedBuild(keyDirectory, key);
    if (published === undefined) return undefined;
    if (await dependencies.gatewayCopyMatches(repoRoot, published.webDirectory)) return published;
    log(`[build] key ${key}: the published attempt's gateway artifact differs from the checkout's; building a new attempt`);
    return undefined;
  };

  const published = await reusable();
  if (published) return served(published, true);
  options.signal?.throwIfAborted();
  const lock = await acquireBuildLock(path.join(keyDirectory, LOCK_FILE), { ...dependencies.lock, signal: options.signal, waitTimeoutMs: options.waitTimeoutMs });
  try {
    const builtMeanwhile = await reusable();
    if (builtMeanwhile) return served(builtMeanwhile, true);
    return served(await buildAttempt({ repoRoot, keyDirectory, key, env, run, log }, dependencies), false);
  } finally {
    await lock.release();
  }
}

function checkCacheRoot(cacheRoot, repoRoot, pathBudget) {
  if (insideNodeModules(cacheRoot)) {
    throw webBuildError(
      "environment",
      `The web build cache ${cacheRoot} is inside a node_modules directory, where Turbopack cannot build the panel: its build worker aborts with exit 3221225501. Point FLUXIQ_CORE_WEB_BUILD_CACHE at a directory outside node_modules, or unset it to use the Core's own .tmp/web-build.`,
      { cacheRoot }
    );
  }
  const budget = pathBudget(cacheRoot);
  if (!budget.fits) {
    throw webBuildError(
      "environment",
      `The web build cache path is too long for this filesystem: ${cacheRoot} is ${budget.root} characters and the deepest file Next writes below it needs ${budget.longest}, over the ${budget.limit}-character limit. Point FLUXIQ_CORE_WEB_BUILD_CACHE at a short directory (for example F:\\fxcache) -- at most ${budget.allowed} characters.`,
      { cacheRoot, ...budget }
    );
  }
  const cacheFilesystem = path.parse(cacheRoot).root.toLowerCase();
  const coreFilesystem = path.parse(repoRoot).root.toLowerCase();
  if (cacheFilesystem !== coreFilesystem) {
    throw webBuildError(
      "environment",
      `The web build cache ${cacheRoot} is on another filesystem root than the Core checkout ${repoRoot}; a staged build resolves Core's installation through links, so Turbopack needs one root holding both. Point FLUXIQ_CORE_WEB_BUILD_CACHE at a directory on ${coreFilesystem}.`,
      { cacheRoot, repoRoot }
    );
  }
}
