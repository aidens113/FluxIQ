// Runs one step, or reuses a result that `decideStep` proves still stands --
// this tree's own stamp, or a result from the shared store.
//
// In order:
//   1. A current local stamp is a reuse, with no lock taken. Output
//      timestamps move only when an input is newer than every output
//      (`touch-stale-outputs.mjs`).
//   2. Otherwise the step's lock is taken (`lock/`). A process that had to wait
//      for another one's run decides again, and normally reuses what that run
//      stamped.
//   3. Unless FLUXIQ_BUILD_FORCE=1, the shared store (`store/`) is asked for an
//      entry under the step's fingerprint (or this tree's rooted entry). A
//      verified restore is a reuse; an entry that fails verification is
//      discarded and the reason is kept.
//   4. Otherwise the command runs. The stamp is removed first, so a build that
//      is killed or crashes leaves nothing vouching for outputs it may have
//      half-written. After the command:
//        - a failure leaves the step unstamped and returns its exit code;
//        - a success is stamped only when the fingerprint taken again
//          afterwards is the one taken before, because an input that changed
//          while the step ran may or may not be in what it produced;
//        - a success that did not produce a required file fails, since
//          stamping it would let the next run reuse an incomplete output;
//        - a stamped result is offered to the store.
// A check is a step without outputs, so it is stamped, and stored as a pass
// record, only when it passed; a step that replays its output keeps what it
// printed in the stamp and the entry, and a reuse hands it back as `replay`.
// A store that cannot be read or written costs the reuse, never the build:
// its failure is reported in the reason. A checkout git cannot list runs the
// command uncached.

import { existsSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { decideStep } from "./decide-step.mjs";
import { fingerprintStep } from "./fingerprint-step.mjs";
import { openStatCache, outputState } from "./fingerprint/index.mjs";
import { acquireStepLock } from "./lock/index.mjs";
import { runCommand } from "./run-command.mjs";
import { removeStamp, STAMP_VERSION, writeStamp } from "./stamp/index.mjs";
import { restoreEntry, saveEntry, storeDirectory } from "./store/index.mjs";
import { touchStaleOutputs } from "./touch-stale-outputs.mjs";
import { resolveStep } from "./workspace/index.mjs";

/**
 * @typedef {{ result: "reuse" | "build", step: string, reason: string, ms: number, exitCode: number, source: "stamp" | "store" | "command", fingerprint: string | null, replay: string | null, output: string | null }} StepOutcome
 *   `replay` is the stored output a reused replaying step hands back; `output` is what a run printed, when it was captured
 * @typedef {(context: { resolved: ReturnType<typeof resolveStep>, env: NodeJS.ProcessEnv, stdio?: import("node:child_process").StdioOptions, capture?: "tee" | "buffer" }) => Promise<{ exitCode: number, output: string | null }>} StepRunner
 */

/**
 * @param {string | ReturnType<typeof resolveStep>} step a registry name, or a step already resolved
 * @param {{ repoRoot?: string, env?: NodeJS.ProcessEnv, steps?: object, stdio?: import("node:child_process").StdioOptions, capture?: "tee" | "buffer", run?: StepRunner, lock?: Parameters<typeof acquireStepLock>[1] }} [options]
 *   `run` replaces running the step's command in its package directory
 * @returns {Promise<StepOutcome>}
 */
export async function runStep(step, options = {}) {
  const started = performance.now();
  const env = options.env ?? process.env;
  const resolved = typeof step === "string" ? resolveStep(step, options) : step;
  const capture = options.capture ?? (resolved.replayOutput ? "tee" : undefined);
  const run =
    options.run ?? (({ env: runEnv, stdio, capture: mode }) => runCommand(resolved.command, { cwd: resolved.packageDir, repoRoot: resolved.repoRoot, env: runEnv, stdio, capture: mode }));
  const finish = (result, reason, exitCode, source, extra = {}) => ({
    result,
    step: resolved.name,
    reason,
    ms: Math.round(performance.now() - started),
    exitCode,
    source,
    fingerprint: extra.fingerprint ?? null,
    replay: extra.replay ?? null,
    output: extra.output ?? null
  });
  const statCache = await openStatCache(resolved.statCachePath);
  try {
    let first;
    try {
      first = await decideStep(resolved, { ...options, env, statCache });
    } catch (error) {
      if (error?.code !== "BUILD_CACHE_NO_GIT") throw error;
      const ran = await run({ resolved, env, stdio: options.stdio, capture });
      return finish("build", `not cached: ${error.message}`, ran.exitCode, "command", { output: ran.output });
    }
    if (first.decision === "reuse") {
      const touched = await touchStaleOutputs(resolved, first.newestInput, first.newestOutput);
      return finish("reuse", `${first.reason}${touched}`, 0, "stamp", { fingerprint: first.fingerprint, replay: replayOf(resolved, first.stamp?.output) });
    }
    const lock = await acquireStepLock(`${resolved.stampPath}.lock`, options.lock);
    try {
      return await runLocked(resolved, first, lock, { ...options, env, statCache, finish, run, capture });
    } finally {
      await lock.release();
    }
  } finally {
    await statCache.save();
  }
}

async function runLocked(resolved, first, lock, options) {
  const { env, statCache, finish, run, capture } = options;
  let decision = first;
  let waited = "";
  if (lock.waitedMs > 0) {
    waited = `waited ${(lock.waitedMs / 1000).toFixed(1)}s for pid ${lock.heldBy}'s run of this step, then `;
    decision = await decideStep(resolved, { ...options, statCache });
    if (decision.decision === "reuse") {
      const touched = await touchStaleOutputs(resolved, decision.newestInput, decision.newestOutput);
      return finish("reuse", `${waited}${decision.reason}${touched}`, 0, "stamp", { fingerprint: decision.fingerprint, replay: replayOf(resolved, decision.stamp?.output) });
    }
  }

  const storeDir = storeDirectory(env);
  const forced = env.FLUXIQ_BUILD_FORCE === "1";
  let storeNote = "";
  if (storeDir !== null && !forced) {
    try {
      const restored = await restoreEntry(storeDir, resolved, decision, statCache);
      if (restored.restored) {
        const which = restored.rooted ? "this tree's entry in the shared store" : "the shared store";
        // A restore that found every file already in place copied nothing, so
        // the same timestamp rule as a stamp reuse applies.
        const touched = await touchStaleOutputs(resolved, decision.newestInput, restored.newestOutput);
        const reason = `${waited}restored from ${which} (${decision.reason}; ${restored.copied} file(s) copied)${touched}`;
        return finish("reuse", reason, 0, "store", { fingerprint: decision.fingerprint, replay: replayOf(resolved, restored.output) });
      }
      if (restored.reason !== null) storeNote = `; ${restored.reason}`;
    } catch (error) {
      storeNote = `; the shared store could not be read (${error?.message ?? error})`;
    }
  }
  const reason = `${waited}${decision.reason}${storeNote}`;

  await removeStamp(resolved.stampPath);
  const ran = await run({ resolved, env, stdio: options.stdio, capture });
  const printed = { output: capture === "buffer" ? ran.output : null, fingerprint: decision.fingerprint };
  if (ran.exitCode !== 0) {
    await removeStamp(resolved.stampPath);
    return finish("build", `${reason}; the command failed with exit code ${ran.exitCode}, so it is not stamped`, ran.exitCode, "command", printed);
  }

  const after = await fingerprintStep(resolved, { statCache });
  if (after.fingerprint !== decision.fingerprint) {
    const moved = Object.keys(after.roots).filter((label) => after.roots[label] !== decision.roots[label]);
    return finish("build", `${reason}; not stamped, because inputs changed while it ran (${moved.join(", ") || "step metadata"})`, 0, "command", printed);
  }
  const missing = resolved.required.find((file) => !existsSync(file));
  if (missing !== undefined) {
    const shown = path.relative(resolved.repoRoot, missing).split(path.sep).join("/");
    return finish("build", `${reason}; the command succeeded but did not produce ${shown}, so it is not stamped`, 1, "command", printed);
  }
  const { digest } = await outputState(resolved, statCache);
  const kept = resolved.replayOutput ? (ran.output ?? "") : null;
  await writeStamp(resolved.stampPath, { version: STAMP_VERSION, step: resolved.name, fingerprint: decision.fingerprint, outputDigest: digest, roots: decision.roots, output: kept });
  if (storeDir === null) return finish("build", reason, 0, "command", printed);
  let stored;
  try {
    stored = (await saveEntry(storeDir, resolved, { fingerprint: decision.fingerprint, outputDigest: digest, output: kept })).reason;
  } catch (error) {
    stored = `not stored: the shared store could not be written (${error?.message ?? error})`;
  }
  return finish("build", `${reason}; ${stored}`, 0, "command", printed);
}

/** The stored output a reused step replays, or null for a step that does not replay. */
function replayOf(resolved, output) {
  return resolved.replayOutput ? (typeof output === "string" ? output : "") : null;
}
