// The owner file both kinds of step lock are made of: the writer's
// `<lock>` and each reader's `<lock>.reader-<token>`.
//
// An owner file is created only if absent: its content is written to a
// private temporary file and hard-linked into place, and `link` fails when the
// name exists, so no reader ever sees an owner file without its owner. An
// owner is stale when its pid is no longer running on this machine, or when
// the file is older than `staleMs` (heartbeats keep a long holder's file
// young). A stale writer file is broken by renaming it aside and checking the
// renamed file is the one that was judged stale; one that was replaced in
// between is put back. Release removes a file only while it still bears the
// releasing owner's token.

import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, utimesSync } from "node:fs";
import { link, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

/** Creates `filePath` holding `owner` unless it exists; `false` when it does. */
export async function createLockFile(filePath, owner) {
  const temporary = `${filePath}.${process.pid}.${owner.token}.tmp`;
  await writeFile(temporary, JSON.stringify(owner));
  try {
    await link(temporary, filePath);
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

/** The file's owner and age, or `null` when it vanished before it could be read (the caller decides again). */
export async function readLockHolder(filePath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readHolderOnce(filePath);
    } catch (error) {
      if (!TRANSIENT_CODES.has(error?.code) || attempt >= TRANSIENT_RETRIES) throw error;
      await delay(TRANSIENT_DELAY_MS);
    }
  }
}

async function readHolderOnce(filePath) {
  try {
    const [text, stats] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
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

/**
 * Whether a holder read by `readLockHolder` may be broken: its pid is not
 * running (another pid in this process's place is never judged dead), or its
 * file has not been touched for `staleMs`.
 * @param {{ pid: number, mtimeMs: number }} holder
 * @param {{ staleMs: number, now: () => number, isAlive: (pid: number) => boolean }} options
 */
export function isStaleHolder(holder, { staleMs, now, isAlive }) {
  if (holder.pid !== process.pid && !isAlive(holder.pid)) return true;
  return now() - holder.mtimeMs > staleMs;
}

/** Breaks the writer file `holder` was read from, unless it was replaced meanwhile. */
export async function breakLockFile(filePath, holder) {
  const aside = `${filePath}.stale-${randomUUID()}`;
  try {
    await rename(filePath, aside);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const moved = await readLockHolder(aside);
  if (moved !== null && moved.token !== holder.token) {
    // Somebody took the lock between the read and the rename: give it back.
    // `link` refuses if a third process has taken the name meanwhile, which
    // leaves that process holding it and this one waiting on it.
    try {
      await link(aside, filePath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  await rm(aside, { force: true });
}

/** Removes `filePath` if it still bears `token`. */
export async function releaseLockFile(filePath, token) {
  const holder = await readLockHolder(filePath);
  if (holder !== null && holder.token === token) await rm(filePath, { force: true });
}

/**
 * The synchronous release, for `process.on("exit")`: removes `filePath` only
 * while it bears `token`, and never throws, so a damaged or replaced file is
 * left for the next acquirer to judge.
 */
export function releaseLockFileSync(filePath, token) {
  try {
    if (JSON.parse(readFileSync(filePath, "utf8")).token === token) unlinkSync(filePath);
  } catch {
    /* best-effort: a dead owner's file stays recoverable by staleness. */
  }
}

/**
 * Refreshes `filePath`'s age while it bears `token`; throws when it was
 * removed or replaced, which means the holder lost it.
 */
export function touchLockFileSync(filePath, token) {
  const owner = JSON.parse(readFileSync(filePath, "utf8"));
  if (owner.token !== token) throw new Error(`lock replaced: ${filePath}`);
  const now = new Date();
  utimesSync(filePath, now, now);
}
