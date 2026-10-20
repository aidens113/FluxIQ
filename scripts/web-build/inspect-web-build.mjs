// What `prepareWebBuild` would do now, without doing it: the key it would
// use and whether a complete build is already published for it. The same
// key and cache root, and only reads -- no directory, no lock, no generator,
// no build. (Keying hashes through the build cache's stat cache, which it
// saves, as `decideStep` does.)

import path from "node:path";
import { REPOSITORY_ROOT } from "../build-cache/index.mjs";
import { webBuildCacheRoot } from "./location/index.mjs";
import { readPublishedBuild } from "./publication/index.mjs";
import { webBuildKey } from "./web-build-key.mjs";

/**
 * @param {{ repoRoot?: string, cacheRoot?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<{ key: string, cached: boolean }>}
 */
export async function inspectWebBuild(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPOSITORY_ROOT);
  const env = options.env ?? process.env;
  const cacheRoot = options.cacheRoot ? path.resolve(options.cacheRoot) : webBuildCacheRoot(repoRoot, env);
  const { key } = await webBuildKey(repoRoot, { env });
  return { key, cached: (await readPublishedBuild(path.join(cacheRoot, key), key)) !== undefined };
}
