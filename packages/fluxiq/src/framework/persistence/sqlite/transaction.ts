export type SQLiteTransaction = {
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastID: number }>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
};
