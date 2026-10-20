// The create-only lock of one key: the build cache's step lock
// (`scripts/build-cache/lock/`), taken in the key directory, with a bound on
// how long to wait and a way to stop waiting.
//
// The step lock waits for as long as its holder is alive and the lock is
// younger than `staleMs`, and breaks it otherwise. Here the default staleness
// is longer than any panel build, and a caller may cap the wait or abort it:
// the step lock asks `isAlive` on every poll of a lock another process holds,
// so that is where the deadline and the signal are checked.

import { acquireStepLock, isProcessAlive } from "../build-cache/index.mjs";
import { webBuildError } from "./web-build-error.mjs";

const STALE_MS = 40 * 60 * 1000;

/**
 * @param {string} lockPath
 * @param {{ waitTimeoutMs?: number, signal?: AbortSignal, staleMs?: number, pollMs?: number, isAlive?: (pid: number) => boolean, now?: () => number }} [options]
 * @returns {Promise<{ waitedMs: number, heldBy: number | null, release(): Promise<void> }>}
 */
export async function acquireBuildLock(lockPath, options = {}) {
  const now = options.now ?? Date.now;
  const isAlive = options.isAlive ?? isProcessAlive;
  const deadline = now() + (options.waitTimeoutMs ?? Number.POSITIVE_INFINITY);
  const stop = { reason: null };
  try {
    return await acquireStepLock(lockPath, {
      staleMs: options.staleMs ?? STALE_MS,
      ...(options.pollMs === undefined ? {} : { pollMs: options.pollMs }),
      now,
      isAlive: (pid) => {
        if (options.signal?.aborted) stop.reason = "aborted";
        else if (now() >= deadline) stop.reason = "timeout";
        if (stop.reason !== null) throw stop;
        return isAlive(pid);
      }
    });
  } catch (error) {
    if (error !== stop) throw error;
    if (stop.reason === "aborted") throw options.signal.reason ?? new Error("The wait for the web build lock was aborted.");
    throw webBuildError("build", `Timed out after ${options.waitTimeoutMs} ms waiting for another process to build the web panel for this key; its lock is left alone.`, { lockPath, waitTimeoutMs: options.waitTimeoutMs });
  }
}
