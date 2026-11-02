import type { LlmVerificationDefect } from "../diagnosis/index.ts";

/**
 * One defect Core located in its own record, in the shape a judge's
 * `diagnosis.defects` entry takes (`../../llm/verification-defects/schema.ts`):
 * the closed kind, the row (its label as Core's record says it, or the step for
 * an act), an optional column, value and step, and the request's words it is
 * held to. `requestWords` is always the request's own text (a phrase that runs
 * in it), or, where the defect is that the request states nothing for it, the
 * clause of the request the row falls under.
 */

export type ResultComputedDefect = LlmVerificationDefect;
