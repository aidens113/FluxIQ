import { stat, utimes } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import { ownerFile } from "./file.ts";
import type { FluxIQDataRootOwner, FluxIQDataRootOwnerRead } from "./record.ts";

/** What watching an owner file showed: still renewed by its holder, left alone, or replaced. */
export type OwnerFileObservation =
  | { kind: "renewing"; read: FluxIQDataRootOwnerRead }
  | { kind: "stale"; read: FluxIQDataRootOwnerRead }
  | { kind: "changed" };

/**
 * The holder's heartbeat on its owner file. The holder touches the file's modification time while
 * the file still carries its token; another process that cannot check the holder's process (it is
 * on another machine or in another container, or its start time cannot be read) watches the file
 * for a while instead. Only a change of the time is compared, never its value, so neither clock
 * nor skew between machines matters.
 */
export const ownerHeartbeat = Object.freeze({
  /**
   * Renews the holder's claim: "renewed"; "lost" when another process's record is in the file;
   * "gone" when the data root itself no longer exists, so nobody can serve it. A missing file is
   * created again with the holder's record, which fails if another claim got there first.
   */
  async renew(file: string, owner: FluxIQDataRootOwner): Promise<"renewed" | "lost" | "gone"> {
    const current = await ownerFile.read(file);
    if (current.kind === "missing") return await restore(file, owner);
    if (current.kind !== "known" || current.owner.token !== owner.token) return "lost";
    const now = new Date();
    try {
      await utimes(file, now, now);
    } catch (error) {
      // Removed between the read and the touch: another process took the root.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "lost";
      throw error;
    }
    return "renewed";
  },

  /** Watches the file for `waitMs`: "renewing" when its holder touched it, "stale" when nothing did. */
  async observe(file: string, waitMs: number): Promise<OwnerFileObservation> {
    const before = await snapshot(file);
    if (!before) return { kind: "changed" };
    await pause(waitMs);
    const after = await snapshot(file);
    if (!after || identity(after.read) !== identity(before.read)) return { kind: "changed" };
    return after.modifiedAt === before.modifiedAt ? { kind: "stale", read: after.read } : { kind: "renewing", read: after.read };
  }
});

async function restore(file: string, owner: FluxIQDataRootOwner): Promise<"renewed" | "lost" | "gone"> {
  try {
    if (await ownerFile.create(file, owner)) return "renewed";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "gone";
    throw error;
  }
  const current = await ownerFile.read(file);
  return current.kind === "known" && current.owner.token === owner.token ? "renewed" : "lost";
}

async function snapshot(file: string): Promise<{ modifiedAt: number; read: FluxIQDataRootOwnerRead } | null> {
  try {
    const { mtimeMs } = await stat(file);
    const read = await ownerFile.read(file);
    return read.kind === "missing" ? null : { modifiedAt: mtimeMs, read };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function identity(read: FluxIQDataRootOwnerRead): string {
  return read.kind === "known" ? `known:${read.owner.token}` : read.kind;
}
