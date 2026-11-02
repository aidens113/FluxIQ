// The run-level recovery budget's defaults (state-aware recovery plan, C7), one
// named constant each. The budget is one ledger for the whole run, carried
// across Subflow frames and never reset by entering or leaving one; it never
// lowers a node below its four attempts and never counts an optional step's
// way on. `runtime/executor/lifecycle/budget.ts` reads these.

/** Routes to a checkpoint, and authored failed routes and reroutes, per run. */
export const AUTOMATION_STUDIO_DEFAULT_MAX_REROUTES_PER_RUN = 2;

/** Known alternatives tried per incident (stored as `maxRecoveryAttemptsPerSubflow`). */
export const AUTOMATION_STUDIO_DEFAULT_MAX_RECOVERY_ATTEMPTS_PER_SUBFLOW = 2;

/** Handler runs for one recovery incident. */
export const AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_INCIDENT = 3;

/** Handler runs in one whole run, every frame included. */
export const AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_RUN = 12;
