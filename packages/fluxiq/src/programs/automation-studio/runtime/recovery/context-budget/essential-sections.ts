import type { AutomationStudioRecoveryContextSection } from "../context.ts";

/**
 * The sections a repair cannot be asked to work without, which the byte budget
 * trims and does not drop while anything else is left to drop.
 *
 * They are the head of `AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS`, in the same
 * order, and that is what keeps the drop order a suffix of the priority list:
 * every section below them goes whole before any of these is touched, exactly as
 * it always did. What changed is what happens next. The failure record says
 * what went wrong, the two transitions say what the step expected and got, and
 * the graph and the step chain are the Flow the repair is being asked to change
 * and what each step of it ran with -- the debug protocol's minimum for a repair.
 * Live run `run-munnhi5q-4867dabe` (2026-09-29) lost the last two whole, because
 * one refuted result's failure record plus an eleven-node graph did not fit, and
 * the repair was asked to fix a wrong filter without seeing a single parameter.
 */
export const AUTOMATION_STUDIO_RECOVERY_CONTEXT_ESSENTIAL_SECTIONS: ReadonlySet<AutomationStudioRecoveryContextSection> = new Set<AutomationStudioRecoveryContextSection>([
  "failure",
  "expected_transition",
  "actual_transition",
  "flow_graph",
  "step_parameters"
]);
