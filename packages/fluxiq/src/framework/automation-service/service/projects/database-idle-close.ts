/**
 * How long the service keeps a project's database open after its last lease is
 * released, in case the next operation follows (t246).
 *
 * A service runs its operations back to back, each releasing before the next
 * acquires, so closing on every release reopened the database once per
 * operation. Measured 2026-10-02 on one representative case (create a Flow,
 * install its primary router, run it, read the run detail): 22 opens and 1.4 s
 * on a quiet machine, 5.9 s under load, against 1 open and 0.8 s / 2.4 s with
 * this grace period. A second covers the gap between operations in a burst and
 * still closes a project nobody is using. See `AutomationStudioProjectDatabasePool`.
 */
export const AUTOMATION_STUDIO_PROJECT_DATABASE_IDLE_CLOSE_MS = 1_000;
