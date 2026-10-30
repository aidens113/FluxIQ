import path from "node:path";
import { SQLiteConnectionPool } from "../database-manager/storage/connection-pool.ts";
import { programStateRoot } from "./state-root.ts";

/**
 * The connections the storage layout's SQLite state keeps open between the
 * operations of one unit of work (`./storage.ts`, t435). A unit of work opts
 * in with `programStateConnections.forRoot(dir).keepWhile` (a runtime session
 * run does); every kept connection is closed when the last one ends, and
 * FluxIQ closes any left of its own storage root when it is closed
 * (`framework/index.ts`).
 *
 * There is one pool per storage root, never one per process: a hosting
 * process runs many workspaces, and a shared pool let one workspace's close
 * cut another's in-flight runs and let one workspace's `keepWhile` hold
 * another's connections open (t808).
 */
class ProgramStateConnections {
  private readonly pools = new Map<string, SQLiteConnectionPool>();

  /** The pool of the storage root owning `dir`, created on first use. */
  forRoot(dir: string): SQLiteConnectionPool {
    const root = this.rootOf(dir);
    let pool = this.pools.get(root);
    if (!pool) {
      pool = new SQLiteConnectionPool();
      this.pools.set(root, pool);
    }
    return pool;
  }

  /** Closes every connection kept for the storage root owning `dir` and forgets its pool; a no-op when it has none. */
  async close(dir: string): Promise<void> {
    const root = this.rootOf(dir);
    const pool = this.pools.get(root);
    if (!pool) return;
    this.pools.delete(root);
    await pool.closeAll();
  }

  /** The storage roots that currently have a pool. */
  roots(): string[] {
    return [...this.pools.keys()];
  }

  private rootOf(dir: string): string {
    return programStateRoot(dir)?.dir ?? path.resolve(dir);
  }
}

/**
 * The storage state's SQLite connection pools, one per storage root: a unit of
 * work keeps connections with `forRoot(dir).keepWhile`, and a FluxIQ instance
 * closes only its own root's with `close(dir)` (t435, t808).
 */
export const programStateConnections = new ProgramStateConnections();
