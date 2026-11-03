// Barrel for the Flow Bootstrap plan. The export list is what plan.ts
// published before the split, plus the feedback a refused plan is answered
// with, which the evidence-guided completion check builds.
//
// issues.ts, json-guards.ts, layout.ts, parameter-text.ts, required-terms.ts and
// risk.ts are deliberately absent: they export helpers shared between the
// modules below, and publishing them would widen the program's public surface.
//
// record-output-contract.ts is published, because ../authoring/ is a second
// legitimate reader of it -- it fills in a half-written record output against
// the same contract validation refuses one by -- and a sibling directory may
// only read this one through its barrel.
//
// name-correction-assumption.ts is published for the same kind of reason: an
// assumption travels out of validation on the accepted plan, so whatever
// records or reports a run has to read the type. name-correction.ts is
// published with it because a caller that builds a plan without validating it
// -- a repair rewriting one node -- should resolve its names through the same
// pass rather than a second one.
export * from "./catalog.ts";
export * from "./catalog-names.ts";
export * from "./contracts.ts";
export * from "./evidence-schema.ts";
export * from "./flow-script-format.ts";
export * from "./issue-feedback.ts";
export * from "./limits.ts";
export * from "./name-correction.ts";
export * from "./name-correction-assumption.ts";
export * from "./output-schema.ts";
export * from "./parsing.ts";
export * from "./profile-limits.ts";
export * from "./record-output-contract.ts";
export * from "./route-condition.ts";
export * from "./route-validation.ts";
export * from "./routing-context.ts";
export * from "./size-limits.ts";
export * from "./validation.ts";
