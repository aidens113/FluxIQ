// One build attempt of one key, run by the holder of the key's lock: stage,
// build, check, and only then mark complete and publish.
//
// The attempt gets a directory of its own, created only if absent, and is
// never moved, so every path the build recorded stays valid for the
// `next start` processes that will serve it. Nothing is published unless
// `next build` exited 0, left a build id, embeds Core's stamped runtime
// identity, and Core's inputs still have the fingerprint the key was taken
// from -- a `dist` rebuilt while the panel was building would otherwise be
// published under a key it does not match.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { isolatedBuildEnvironment } from "./build-environment.mjs";
import { nextExecutable } from "./next-executable.mjs";
import { markBuildComplete, newBuildAttemptName, publishBuildAttempt, readBuildId } from "./publication/index.mjs";
import { webBuildError } from "./web-build-error.mjs";

/**
 * @param {{ repoRoot: string, keyDirectory: string, key: string, env: NodeJS.ProcessEnv, run: Function, log: (line: string) => void }} context
 * @param {{ stage: Function, gatewayCopyMatches: Function, assertIdentity: Function, key: Function }} dependencies
 * @returns {Promise<{ key: string, directory: string, webDirectory: string, buildId: string }>}
 */
export async function buildAttempt(context, dependencies) {
  const { repoRoot, keyDirectory, key, env, run, log } = context;
  const attempt = newBuildAttemptName();
  const directory = path.join(keyDirectory, attempt);
  await mkdir(directory);
  const fluxiqRoot = path.join(directory, "fluxiq-root");
  await mkdir(path.join(fluxiqRoot, ".fluxiq"), { recursive: true });
  const { webDirectory } = await dependencies.stage(repoRoot, directory);
  if (!(await dependencies.gatewayCopyMatches(repoRoot, webDirectory))) {
    throw webBuildError("build", "The staged gateway server artifact differs from the Core checkout's, so the build was not run.", { webDirectory });
  }
  log(`[build] key ${key}: building in ${directory}`);
  await run({ name: "web-build", command: nextExecutable(repoRoot), args: ["build", "--turbopack"], cwd: webDirectory, env: isolatedBuildEnvironment(env, fluxiqRoot), shell: process.platform === "win32" });
  const buildId = await readBuildId(webDirectory);
  if (!buildId) throw webBuildError("build", "The web panel build exited cleanly but left no build id, so it was not published.", { webDirectory });
  try {
    await dependencies.assertIdentity(webDirectory);
  } catch (cause) {
    throw webBuildError("build", `${cause instanceof Error ? cause.message : String(cause)} The build was not published.`, { webDirectory }, cause);
  }
  const after = await dependencies.key(repoRoot, env);
  if (after.key !== key) {
    throw webBuildError("build", `Core's build inputs changed while the web panel was building (key ${key} became ${after.key}), so the build was not published; prepare it again.`, { key, now: after.key });
  }
  await markBuildComplete(directory, key, buildId);
  await publishBuildAttempt(keyDirectory, key, attempt);
  log(`[build] key ${key}: published ${attempt} (build id ${buildId})`);
  return { key, directory, webDirectory, buildId };
}
