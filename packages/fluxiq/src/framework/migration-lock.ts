import { createHash, randomUUID } from "node:crypto";
import { link, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Takes the storage migration lock at `lockPath` for this process: true when
 * this process now holds it, false when a process that is still running, or
 * one on another machine, holds it.
 *
 * A lock whose holder on this machine has exited is taken over, and only one
 * of several processes taking over the same stale lock at once wins (t932).
 * The stale lock is removed only by the holder of a takeover marker named by
 * that lock's exact content, after reading the lock again under the marker: a
 * contender that judged the same lock competes for the same marker, and one
 * that arrives after a takeover finds a different lock and backs off. Every
 * claim is written whole before it appears, so no reader ever sees one half
 * written, and a marker whose holder crashed is taken over the same way.
 *
 * Each attempt first clears what a crashed attempt left beside the lock: a
 * takeover marker whose holder on this machine has exited (taken over the same
 * way, then removed, so a marker another contender has just taken is never
 * removed) and a half-made claim whose writer on this machine has exited.
 */
export async function acquireMigrationLock(lockPath: string): Promise<boolean> {
  await removeLeftovers(lockPath);
  return await claimFile(lockPath);
}

async function claimFile(target: string): Promise<boolean> {
  const claim = JSON.stringify({ pid: process.pid, host: os.hostname(), startedAt: Date.now(), token: randomUUID() });
  if (await createWithContent(target, claim)) return true;
  const stale = await readClaim(target);
  // Released between the attempt and the read: one more exclusive attempt, which a process that got there first wins.
  if (stale === null) return await createWithContent(target, claim);
  if (!heldByExitedProcess(stale)) return false;
  const marker = `${target}.takeover-${createHash("sha256").update(stale).digest("hex").slice(0, 32)}`;
  if (!await claimFile(marker)) return false;
  try {
    if (await readClaim(target) !== stale) return false;
    await rm(target, { force: true });
    return await createWithContent(target, claim);
  } finally {
    await rm(marker, { force: true });
  }
}

/**
 * Clears what crashed attempts on this machine left beside `lockPath`. A dead
 * holder's marker is claimed before it is removed: removing it on a plain read
 * could remove one a live contender had just taken over. A half-made claim is
 * only ever used by the process that wrote it, so a dead writer's is removed
 * outright; its name carries the writer's machine and process.
 */
async function removeLeftovers(lockPath: string): Promise<void> {
  const directory = path.dirname(lockPath);
  const lockName = path.basename(lockPath);
  for (const name of await readdir(directory)) {
    if (!name.startsWith(`${lockName}.`)) continue;
    const suffix = name.slice(lockName.length);
    const leftover = path.join(directory, name);
    if (MARKER_SUFFIX.test(suffix)) {
      const holder = await readClaim(leftover);
      if (holder !== null && heldByExitedProcess(holder) && await claimFile(leftover)) await rm(leftover, { force: true });
      continue;
    }
    const written = HALF_MADE_SUFFIX.exec(suffix);
    if (written && written[1] === HOST_TAG && !processIsAlive(Number(written[2]))) await rm(leftover, { force: true });
  }
}

/** This machine, in the names of half-made claims. */
const HOST_TAG = createHash("sha256").update(os.hostname()).digest("hex").slice(0, 8);
const MARKER_SUFFIX = /^(?:\.takeover-[0-9a-f]{32})+$/;
const HALF_MADE_SUFFIX = /^(?:\.takeover-[0-9a-f]{32})*\.([0-9a-f]{8})\.([1-9][0-9]*)\.[0-9a-f-]{36}\.tmp$/;

/** Creates `target` already holding `content`, or answers false when it exists: a hard link of a finished file is the exclusive create. */
async function createWithContent(target: string, content: string): Promise<boolean> {
  const written = `${target}.${HOST_TAG}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(written, content, "utf8");
  try {
    await link(written, target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    await rm(written, { force: true });
  }
}

/** The claim's text, or null when there is none. */
async function readClaim(target: string): Promise<string | null> {
  try {
    return await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** True only for a claim this machine wrote whose process has exited; a claim that cannot be read as one is treated as held. */
function heldByExitedProcess(claim: string): boolean {
  let holder: { pid?: unknown; host?: unknown };
  try {
    holder = JSON.parse(claim) as { pid?: unknown; host?: unknown };
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
  return holder.host === os.hostname() && typeof holder.pid === "number" && holder.pid > 0 && !processIsAlive(holder.pid);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
