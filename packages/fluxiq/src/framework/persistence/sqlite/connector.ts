import type sqlite3 from "sqlite3";

/** How a repository opens, prepares and closes a connection to one database file. */
export type SQLiteConnector = {
  /** Opens a new connection; the file is created when absent. */
  open(): Promise<sqlite3.Database>;
  /** Readies a connection for this repository (pragmas, its table); run once per connection and `key`. */
  prepare(db: sqlite3.Database): Promise<void>;
  /** Names what `prepare` readies, so a connection shared by several tables readies each once. */
  key: string;
  close(db: sqlite3.Database): Promise<void>;
};
