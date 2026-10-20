// The key of a keyed web build: Core's own `web:build` fingerprint
// (`scripts/build-cache/`), which already covers every input the panel's
// production build reads -- apps/web's files, every workspace package it
// depends on with its built `dist`, the gateway generator's sources, the
// lockfiles and the installed lockfile, Node, the platform, the command and
// `NODE_ENV` and `NEXT_*` -- plus what only a staged build adds: the wrapper
// config's text and this layout's version.
//
// Raise LAYOUT whenever staging, the command or the publication records
// change, so a build made the old way is never reused.

import { createHash } from "node:crypto";
import { fingerprintStep, openStatCache, resolveStep } from "../build-cache/index.mjs";
import { stagedNextConfig } from "./staging/index.mjs";

const LAYOUT = 1;

/**
 * @param {string} repoRoot the Core checkout
 * @param {{ env?: NodeJS.ProcessEnv, statCache?: Awaited<ReturnType<typeof openStatCache>> }} [options]
 * @returns {Promise<{ key: string, fingerprint: string }>} the key is 24 hex characters
 */
export async function webBuildKey(repoRoot, options = {}) {
  const resolved = resolveStep("web:build", { repoRoot, env: options.env ?? process.env });
  const statCache = options.statCache ?? (await openStatCache(resolved.statCachePath));
  try {
    const { fingerprint } = await fingerprintStep(resolved, { statCache });
    const material = JSON.stringify({ layout: LAYOUT, fingerprint, config: stagedNextConfig(repoRoot) });
    return { key: createHash("sha256").update(material).digest("hex").slice(0, 24), fingerprint };
  } finally {
    if (options.statCache === undefined) await statCache.save();
  }
}
