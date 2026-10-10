import { SQLiteConnectionPool } from "../database-manager/storage/connection-pool.ts";

/**
 * The connections the storage layout's SQLite state keeps open between the
 * operations of one unit of work (`./storage.ts`, t435). A unit of work opts
 * in with `programStateConnections.keepWhile` (a runtime session run does);
 * every kept connection is closed when the last one ends, and FluxIQ closes
 * any left when it is closed (`framework/index.ts`).
 */
export const programStateConnections = new SQLiteConnectionPool();
