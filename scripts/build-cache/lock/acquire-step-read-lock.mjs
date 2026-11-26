// Any number of processes read a step's outputs at once: the reader side of
// the step lock (`acquire-step-lock.mjs` is the writer).
//
// A process that reads a step's outputs for a long time -- a downstream Lab
// run importing Core's libraries for an hour -- must not have them replaced
// underneath it, yet two such readers have nothing to fear from each other.
// So a reader records itself in its own owner file beside the writer's lock
// (`reader-entries.mjs`) and holds the step with any number of others.
//
// A reader never enters while the writer's lock file exists, whether its
// writer is building or still waiting for earlier readers to leave: a waiting
// build is never starved. A stale writer file is broken exactly as a writer
// breaks it. Entering is two steps -- create the entry, then look for a lock
// file again -- and the writer's are the mirror -- create the lock file, then
// list the entries -- so at least one of the two always sees the other: a
// reader that finds a lock file after creating its entry withdraws it and
// waits.
//
// A held reader entry is heartbeated, so the writer's stale bound (30 minutes)
// can never evict a live reader, while a dead or hung one goes stale like any
// lock and a writer removes it. Release, asynchronous or synchronous for
// `process.on("exit")`, removes the entry only while it bears this reader's
// token.

import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isProcessAlive } from "./is-process-alive.mjs";
import { breakLockFile, createLockFile, isStaleHolder, readLockHolder, releaseLockFile, releaseLockFileSync, touchLockFileSync } from "./lock-file.mjs";
import { readerEntryPath } from "./reader-entries.mjs";

const STALE_MS = 30 * 60 * 1000;
const POLL_MS = 250;
const HEARTBEAT_MS = 30_000;
// A heartbeat that meets a file in transition on Windows skips one beat: the
// stale bound leaves many beats of room, and the entry is still this reader's.
const TRANSIENT_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

/**
 * @param {string} lockPath the writer's lock path, `<stamp>.lock`
 * @param {{ staleMs?: number, pollMs?: number, now?: () => number, isAlive?: (pid: number) => boolean, heartbeatMs?: number, onLost?: (error: Error) => void }} [options]
 *   `onLost` is called once if the entry is found removed or replaced: the step is no longer held
 * @returns {Promise<{ waitedMs: number, heldBy: number | null, path: string, token: string, assertHeld(): void, release(): Promise<void>, releaseSync(): void }>}
 */
export async function acquireStepReadLock(lockPath, options = {}) {
  const pollMs = options.pollMs ?? POLL_MS;
  const now = options.now ?? Date.now;
  const judge = { staleMs: options.staleMs ?? STALE_MS, now, isAlive: options.isAlive ?? isProcessAlive };
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0 || heartbeatMs >= judge.staleMs) {
    throw new Error(`A step read lock's heartbeat must be positive and shorter than the stale bound (${judge.staleMs} ms)`);
  }
  const token = randomUUID();
  const entry = readerEntryPath(lockPath, token);
  const started = now();
  let heldBy = null;
  let waited = false;
  await mkdir(path.dirname(lockPath), { recursive: true });

  for (;;) {
    const writer = await readLockHolder(lockPath, now);
    if (writer !== null) {
      if (isStaleHolder(writer, judge)) {
        if (await breakLockFile(lockPath, writer)) continue;
        // In use by its live holder: it is not stale after all.
        await delay(pollMs);
        continue;
      }
      heldBy = writer.pid;
      waited = true;
      await delay(pollMs);
      continue;
    }
    if (!(await createLockFile(entry, { pid: process.pid, token, startedAt: new Date(now()).toISOString() }))) {
      throw new Error(`A step read lock's entry already exists: ${entry}`);
    }
    // A writer that created its lock file before this entry existed may not
    // have seen it: give way to it.
    if ((await readLockHolder(lockPath)) === null) break;
    await releaseLockFile(entry, token);
  }

  let lost = null;
  let released = false;
  const timer = setInterval(() => {
    try {
      touchLockFileSync(entry, token, now);
    } catch (error) {
      if (TRANSIENT_CODES.has(error?.code)) return;
      lost = new Error(`Step read lock lost: ${entry}`, { cause: error });
      clearInterval(timer);
      options.onLost?.(lost);
    }
  }, heartbeatMs);
  timer.unref();
  return {
    waitedMs: waited ? now() - started : 0,
    heldBy,
    path: entry,
    token,
    assertHeld() {
      if (lost) throw lost;
    },
    async release() {
      if (released) return;
      released = true;
      clearInterval(timer);
      await releaseLockFile(entry, token);
    },
    releaseSync() {
      if (released) return;
      released = true;
      clearInterval(timer);
      releaseLockFileSync(entry, token);
    }
  };
}
