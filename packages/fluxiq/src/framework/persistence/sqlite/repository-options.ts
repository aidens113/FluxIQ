import type { SQLiteConnectionPool } from "./connection-pool.ts";

export type SQLiteRepositoryOptions = {
  rootDir: string;
  kind: string;
  layoutVersion?: 1 | 2;
  /** Keeps the connection open between operations (`./connection-pool.ts`); without one, each operation opens and closes its own. */
  connections?: SQLiteConnectionPool;
};
