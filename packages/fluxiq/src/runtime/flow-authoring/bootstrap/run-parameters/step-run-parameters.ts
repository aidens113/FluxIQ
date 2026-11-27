// The parameters Core writes onto a step for how it runs, and never for what it acts on (t1075).
//
// **Why one list.** A saved step's parameters are read twice: by the host, which runs the step with them, and
// by the act record, which tells from them which act a step is (`runtime/answer-first/act-record/identity/target-keys.ts`).
// Each parameter Core adds when it assembles or stamps a Flow (a precondition, a state to check before a toggle,
// what to wait for, how long) changes what the host does around the act, never which act it is. The act record's
// reader once kept its own list of such words, the assembly wrote from another, and the two drifted: t1030 wrote
// `requiresChosen` onto a saved act's node, the reader counted it as identity, the node's keys stopped matching the
// press the attempt had landed, and the next attempt's replay pressed "+ Add" a second time (`run-mwynbry2-f3c88dc7`).
//
// So every writer takes its parameter's name from here, and the reader leaves every name here out of identity. A new
// run parameter is added to this list or it is not written; `../../../answer-first/act-record/identity/tests/run-parameters.test.ts`
// fails if any name here changes a node's identity keys.

/** Each run parameter's name, by itself: what a writer spells and the act record leaves out of identity (header). */
export const AUTOMATION_STUDIO_STEP_RUN_PARAMETERS = Object.freeze({
  /** The options that must stand chosen before the act runs (`../instructed-acts/chosen-precondition.ts`, t1030). */
  requiresChosen: "requiresChosen",
  /** The state a toggle's control must be left in, checked before it is pressed (`../script-statements/toggle/idempotent.ts`). */
  ensureState: "ensureState",
  /** What the page shows once the step is done (`../script-statements/step-done-when.ts`). */
  expectedState: "expectedState",
  /** The pages the step ran between as the build saw them, which a run routes by. */
  routeSignatures: "routeSignatures",
  /** How long the host waits for the step before giving up. */
  timeoutMs: "timeoutMs",
  /** The least time between two starts of the step in one run. */
  paceMs: "paceMs",
  /** How a step is retried. */
  retry: "retry",
  /** Where a read records what it found. */
  recordOutput: "recordOutput"
} as const);
