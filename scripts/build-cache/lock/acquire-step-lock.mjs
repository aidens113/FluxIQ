// One process at a time runs a given step in a given tree.
//
// Two processes that decide to build the same step at once -- two `pnpm build`
// runs, a `pnpm check` beside a downstream Core build -- would both delete the stamp, both
// write the same outputs and each fingerprint the other's half-written files.
// So the build path of `runStep` holds a lock beside the step's stamp, and a
// second process that finds it held waits, then decides again: by the time it
// holds the lock the first has normally stamped the step, and the second
// reuses what it built.
//
// The lock is a file created only if absent: its content is written to a
// private temporary file and hard-linked into place, and `link` fails when the
// name exists, so no reader ever sees a lock without its owner. A lock is stale
// when its owner's pid is no longer running on this machine, or when the file
// is older than `staleMs` (30 minutes: longer than any build here, and the
// bound on how long a hung or recycled-pid owner can hold a step). A stale lock
// is broken by renaming it aside and checking the renamed file is the one that
// was judged stale; one that was replaced in between is put back.

import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isProcessAlive } from "./is-process-alive.mjs";

const STALE_MS = 30 * 60 * 1000;
const POLL_MS = 250;

/**
 * @param {string} lockPath
 * @param {{ staleMs?: number, pollMs?: number, now?: () => number, isAlive?: (pid: number) => boolean }} [options]
 * @returns {Promise<{ waitedMs: number, heldBy: number | null, release(): Promise<void> }>}
 */
export async function acquireStepLock(lockPath, options = {}) {
  const staleMs = options.staleMs ?? STALE_MS;
  const pollMs = options.pollMs ?? POLL_MS;
  const now = options.now ?? Date.now;
  const isAlive = options.isAlive ?? isProcessAlive;
  const token = randomUUID();
  const started = now();
  let heldBy = null;
  let waited = false;
  await mkdir(path.dirname(lockPath), { recursive: true });

  for (;;) {
    if (await tryCreate(lockPath, { pid: process.pid, token, startedAt: new Date(now()).toISOString() })) {
      return { waitedMs: waited ? now() - started : 0, heldBy, release: () => release(lockPath, token) };
    }
    const holder = await readHolder(lockPath);
    if (holder === null) continue;
    if (holder.pid !== process.pid && !isAlive(holder.pid)) {
      await breakLock(lockPath, holder);
      continue;
    }
    if (now() - holder.mtimeMs > staleMs) {
      await breakLock(lockPath, holder);
      continue;
    }
    heldBy = holder.pid;
    waited = true;
    await delay(pollMs);
  }
}

async function tryCreate(lockPath, owner) {
  const temporary = `${lockPath}.${process.pid}.${owner.token}.tmp`;
  await writeFile(temporary, JSON.stringify(owner));
  try {
    await link(temporary, lockPath);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

// Windows refuses to open a file another process is deleting (`rm` leaves it
// delete-pending until the last handle closes) or renaming, with EPERM, EACCES
// or EBUSY. That is a lock in transition, not an error: wait for it to settle.
const TRANSIENT_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const TRANSIENT_RETRIES = 50;
const TRANSIENT_DELAY_MS = 20;

/** The lock's owner and age, or `null` when it vanished before it could be read (the caller retries). */
async function readHolder(lockPath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readHolderOnce(lockPath);
    } catch (error) {
      if (!TRANSIENT_CODES.has(error?.code) || attempt >= TRANSIENT_RETRIES) throw error;
      await delay(TRANSIENT_DELAY_MS);
    }
  }
}

async function readHolderOnce(lockPath) {
  try {
    const [text, stats] = await Promise.all([readFile(lockPath, "utf8"), stat(lockPath)]);
    const owner = JSON.parse(text);
    return { pid: Number(owner.pid), token: String(owner.token), mtimeMs: stats.mtimeMs };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    // Written whole before it was linked, so unparsable content is a foreign
    // or damaged file: treat it as an owner that is not running.
    if (error instanceof SyntaxError) return { pid: 0, token: "", mtimeMs: 0 };
    throw error;
  }
}

async function breakLock(lockPath, holder) {
  const aside = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, aside);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const moved = await readHolder(aside);
  if (moved !== null && moved.token !== holder.token) {
    // Somebody took the lock between the read and the rename: give it back.
    // `link` refuses if a third process has taken the name meanwhile, which
    // leaves that process holding it and this one waiting on it.
    try {
      await link(aside, lockPath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  await rm(aside, { force: true });
}

async function release(lockPath, token) {
  const holder = await readHolder(lockPath);
  if (holder !== null && holder.token === token) await rm(lockPath, { force: true });
}
