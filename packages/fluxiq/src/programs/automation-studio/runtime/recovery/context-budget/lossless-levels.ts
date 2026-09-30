import type { AutomationStudioRecoveryContextSection } from "../context.ts";

/**
 * How many of a section's first trim rungs lose nothing, which `fit.ts` applies
 * to every essential section before any lossy rung of any of them.
 *
 * Without this, "largest first" spends the budget in the wrong place: measured
 * on the shape of `run-munnhi5q-4867dabe` at 9,000 bytes, the graph and the step
 * chain were cut to a five-node window and to no parameters but the failing
 * step's, while the failure record still carried a full kilobyte that said the
 * directive beside it a second time -- because it was never the largest section
 * at the moment a rung was chosen.
 *
 * Each count names a prefix of that section's ladder in `section-trim.ts` and
 * must move with it: the failure record's restated directive, and the step
 * chain's repeated per-node parameters.
 */
export const AUTOMATION_STUDIO_RECOVERY_LOSSLESS_TRIM_LEVELS: Readonly<Partial<Record<AutomationStudioRecoveryContextSection, number>>> = Object.freeze({
  failure: 1,
  step_parameters: 1
});
