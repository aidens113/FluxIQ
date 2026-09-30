// Whether a step's last successful result still stands, and why or why not.
//
// Reuse needs all of: a stamp of the current version; a fingerprint equal to
// the one taken now over every input; every required output present; and an
// output digest equal to the one stamped. Anything else is a build, with the
// first failed condition as the reason. `FLUXIQ_BUILD_FORCE=1` is always a
// build. Deciding reads and hashes but writes nothing except the stat cache.

import { existsSync } from "node:fs";
import path from "node:path";
import { fingerprintStep } from "./fingerprint-step.mjs";
import { openStatCache, outputState } from "./fingerprint/index.mjs";
import { readStamp, STAMP_VERSION } from "./stamp/index.mjs";
import { resolveStep } from "./workspace/index.mjs";

const SHOWN_ROOTS = 3;

/**
 * @param {string | ReturnType<typeof resolveStep>} step a registry name, or a step already resolved
 * @param {{ repoRoot?: string, env?: NodeJS.ProcessEnv, steps?: object, statCache?: Awaited<ReturnType<typeof openStatCache>> }} [options]
 * @returns {Promise<{ decision: "reuse" | "build", reason: string, step: string, resolved: ReturnType<typeof resolveStep>, fingerprint: string, roots: Record<string, string>, newestInput: { ms: number, path: string | null }, newestOutput: { ms: number, path: string | null } | null, stamp: object | null }>}
 */
export async function decideStep(step, options = {}) {
  const env = options.env ?? process.env;
  const resolved = typeof step === "string" ? resolveStep(step, options) : step;
  const statCache = options.statCache ?? (await openStatCache(resolved.statCachePath));
  try {
    const { fingerprint, roots, newestInput } = await fingerprintStep(resolved, { statCache });
    const answer = (decision, reason, extra = {}) => ({ decision, reason, step: resolved.name, resolved, fingerprint, roots, newestInput, newestOutput: null, stamp: null, ...extra });
    if (env.FLUXIQ_BUILD_FORCE === "1") return answer("build", "FLUXIQ_BUILD_FORCE=1");
    const stamp = await readStamp(resolved.stampPath);
    if (stamp === null) return answer("build", "no stamp");
    if (stamp.unreadable === true) return answer("build", "stamp unreadable");
    if (stamp.version !== STAMP_VERSION) return answer("build", `stamp version ${stamp.version}, expected ${STAMP_VERSION}`);
    if (stamp.fingerprint !== fingerprint) return answer("build", `inputs changed: ${changedRoots(stamp.roots, roots)}`);
    const missing = resolved.required.find((file) => !existsSync(file));
    if (missing !== undefined) return answer("build", `required output missing: ${path.relative(resolved.repoRoot, missing).split(path.sep).join("/")}`);
    const outputs = await outputState(resolved, statCache);
    if (stamp.outputDigest !== outputs.digest) return answer("build", "outputs changed since they were stamped");
    return answer("reuse", "inputs and outputs match the stamp", { newestOutput: { ms: outputs.newestMs, path: outputs.newestPath }, stamp });
  } finally {
    if (options.statCache === undefined) await statCache.save();
  }
}

/** The labels whose digest differs between the stamp and now, for the reason line. */
function changedRoots(before, now) {
  if (before === null || typeof before !== "object") return "stamp records no per-root digests";
  const labels = [...new Set([...Object.keys(before), ...Object.keys(now)])].sort();
  const changed = labels.filter((label) => before[label] !== now[label]);
  if (changed.length === 0) return "command, Node version, platform or environment";
  const shown = changed.slice(0, SHOWN_ROOTS).join(", ");
  return changed.length > SHOWN_ROOTS ? `${shown} and ${changed.length - SHOWN_ROOTS} more` : shown;
}
