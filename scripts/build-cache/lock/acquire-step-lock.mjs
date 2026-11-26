// One process at a time runs a given step in a given tree: the writer side of
// the step lock.
//
// Two processes that decide to build the same step at once -- two `pnpm build`
// runs, a `pnpm check` beside a downstream Core build -- would both delete the stamp, both
// write the same outputs and each fingerprint the other's half-written files.
// So the build path of `runStep` holds a lock beside the step's stamp, and a
// second process that finds it held waits, then decides again: by the time it
// holds the lock the first has normally stamped the step, and the second
// reuses what it built.
//
// The lock is an owner file (`lock-file.mjs`): created only if absent, stale
// when its owner's pid is no longer running on this machine or when it is older
// than `staleMs` (30 minutes: longer than any build here, and the bound on how
// long a hung or recycled-pid owner can hold a step), and broken by renaming it
// aside.
//
// Readers (`acquire-step-read-lock.mjs`) may share a step: a process that only
// reads the step's outputs for a long time, as a downstream Lab run reads
// Core's libraries. A writer that has created the lock file then waits until
// no live reader entry remains, removing stale ones as it breaks a stale lock.
// It keeps its own file young while it waits, so a long run of readers never
// lets another writer judge it stale, and new readers queue behind it because
// they never enter while the lock file exists: a waiting build is never
// starved. A process that holds a read lock on a step and then builds that
// same step waits on itself, as a second exclusive hold always has.

import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isProcessAlive } from "./is-process-alive.mjs";
import { breakLockFile, createLockFile, isStaleHolder, readLockHolder, releaseLockFile, touchLockFileSync } from "./lock-file.mjs";
import { listReaderEntries } from "./reader-entries.mjs";

const STALE_MS = 30 * 60 * 1000;
const POLL_MS = 250;

/**
 * @param {string} lockPath
 * @param {{ staleMs?: number, pollMs?: number, now?: () => number, isAlive?: (pid: number) => boolean }} [options]
 * @returns {Promise<{ waitedMs: number, heldBy: number | null, heldAs: "write" | "read" | null, release(): Promise<void> }>}
 *   `heldBy` is the pid last waited on and `heldAs` how it held the step: building it, or reading it
 */
export async function acquireStepLock(lockPath, options = {}) {
  const pollMs = options.pollMs ?? POLL_MS;
  const now = options.now ?? Date.now;
  const judge = { staleMs: options.staleMs ?? STALE_MS, now, isAlive: options.isAlive ?? isProcessAlive };
  const token = randomUUID();
  const started = now();
  let heldBy = null;
  let heldAs = null;
  let waited = false;
  await mkdir(path.dirname(lockPath), { recursive: true });

  for (;;) {
    if (await createLockFile(lockPath, { pid: process.pid, token, startedAt: new Date(now()).toISOString() })) {
      const readers = await waitForReaders(lockPath, token, judge, pollMs);
      if (readers.waitedOn !== null) {
        heldBy = readers.waitedOn;
        heldAs = "read";
        waited = true;
      }
      // Broken while it waited (it can only have been judged stale): queue again.
      if (readers.lost) continue;
      return { waitedMs: waited ? now() - started : 0, heldBy, heldAs, release: () => releaseLockFile(lockPath, token) };
    }
    const holder = await readLockHolder(lockPath, now);
    if (holder === null) continue;
    if (isStaleHolder(holder, judge)) {
      if (await breakLockFile(lockPath, holder)) continue;
      // In use by its live holder: it is not stale after all.
      await delay(pollMs);
      continue;
    }
    heldBy = holder.pid;
    heldAs = "write";
    waited = true;
    await delay(pollMs);
  }
}

/** Waits, holding the lock file, until no live reader entry remains. */
async function waitForReaders(lockPath, token, judge, pollMs) {
  let waitedOn = null;
  for (;;) {
    let live = null;
    for (const entry of await listReaderEntries(lockPath)) {
      const reader = await readLockHolder(entry, judge.now);
      if (reader === null) continue;
      // A reader entry is unique to its token, so nobody can have replaced it:
      // a stale one is simply removed, and one that cannot be removed yet (a
      // file in transition on Windows) is still stale, so it never holds a build.
      if (isStaleHolder(reader, judge)) await rm(entry, { force: true }).catch(/* best-effort: a stale entry never holds a build */ () => undefined);
      else live ??= reader;
    }
    if (live === null) return { lost: false, waitedOn };
    waitedOn = live.pid;
    const mine = await readLockHolder(lockPath);
    if (mine === null || mine.token !== token) return { lost: true, waitedOn };
    try {
      touchLockFileSync(lockPath, token, judge.now);
    } catch {
      /* best-effort: a lock in transition on Windows, or replaced since the read; the next poll decides */
    }
    await delay(pollMs);
  }
}
