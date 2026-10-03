import type { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
import type { AutomationStudioProjectStore } from "./store.ts";

/**
 * Runs one service operation with its project's database held open for the
 * operation's own duration.
 *
 * A pool that closes a project database on its last release made an operation
 * whose stores each acquire and release their own lease open and close the
 * database once per store call: 120-215 times in one repaired run, measured.
 * Every close checkpoints the WAL and syncs it to disk, and every open creates
 * the WAL again and runs its pragmas, so under a busy disk those cycles were
 * the most expensive steps of the whole run. Holding one lease across the
 * operation lets every inner acquire reuse the open database. When the
 * operation's lease is released the pool closes it, at once or, for the
 * service's pool, once the project has been idle for its grace period, which
 * lets the next operation reuse it too (t246).
 *
 * The project is checked first, because acquiring a lease creates the project's
 * database: an operation on a project the catalogue does not list runs unheld
 * and fails exactly as it did. A pool that is closing is not acquired from
 * either; the operation runs as it did, and its own first acquire is refused
 * where it always was, so a run whose storage was closed under it still ends
 * as a failed run with its record rather than as a thrown error.
 */
export async function withAutomationStudioProjectDatabaseHeld<T>(
  ports: { pool: AutomationStudioProjectDatabasePool | undefined; projects: Pick<AutomationStudioProjectStore, "readProjectIndex"> },
  projectId: string | null | undefined,
  operation: () => Promise<T>
): Promise<T> {
  const pool = ports.pool;
  const holds = Boolean(pool && !pool.isClosing && typeof projectId === "string" && projectId
    && (await ports.projects.readProjectIndex()).projects.some((project) => project.id === projectId));
  // Checked again after the read: `acquire` refuses synchronously once the
  // pool is closing, so nothing can close it between this check and the call.
  const lease = holds && pool && !pool.isClosing ? await pool.acquire(projectId as string) : null;
  try {
    return await operation();
  } finally {
    await lease?.release();
  }
}
