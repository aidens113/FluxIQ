import type { AutomationStudioSqlRunResult } from "./run-result.ts";

export type AutomationStudioSqlExecutor = {
  run(sql: string, params?: readonly unknown[]): Promise<AutomationStudioSqlRunResult>;
  get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /**
   * Runs a script of parameterless statements in one call, stopping at the
   * first error. Offered by the project database so schema work reaches SQLite
   * as one round trip instead of one per statement; other executors may omit it.
   */
  exec?(script: string): Promise<void>;
};
