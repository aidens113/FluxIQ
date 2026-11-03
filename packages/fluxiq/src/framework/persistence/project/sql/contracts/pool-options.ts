export type AutomationStudioProjectDatabasePoolOptions = {
  rootDir: string;
  busyTimeoutMs?: number;
  /**
   * How long a project database stays open after its last lease is released,
   * in case another lease follows. 0 (the default) closes it on that release.
   * See `AutomationStudioProjectDatabasePool`.
   */
  idleCloseMs?: number;
};
