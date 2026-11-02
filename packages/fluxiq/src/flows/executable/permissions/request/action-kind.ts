

/**
 * When the action would happen, which is the difference a person most needs:
 *
 * - `exploration_step` -- the run wanted to take it now, while finding out how
 *   to do the job. `id` is the option it called, `ref` the call.
 * - `flow_step` -- the Flow would take it every time it runs: the Flow being
 *   built, or, at `recovery`, the Flow a repair would change. `id` is the
 *   step's node definition, `ref` the step's key in the plan or, for a repair,
 *   the node that failed.
 */
export type AutomationStudioActionPermissionActionKind = "exploration_step" | "flow_step";
