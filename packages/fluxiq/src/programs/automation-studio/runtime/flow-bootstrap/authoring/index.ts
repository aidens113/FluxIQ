// Barrel for Flow authoring: the format a model writes in, the parser that
// reads it, and the one acceptor that turns any accepted reply into a plan.
//
// `assemble.ts`, `json-plan.ts`, `issue.ts`, `keys.ts`, `matching.ts`,
// `normalise.ts`, `record-output.ts` and `values.ts` are deliberately absent:
// they are how the acceptor works, not what it offers, and publishing them
// would invite a second place that normalises a plan.
//
// `assemble-draft.ts` is published, and is the one exception, because it is a
// second door rather than a second normaliser: a build that accrued a draft
// hands that draft over instead of a written script, and both go through
// `assemble.ts` from there.
export * from "./accept.ts";
export * from "./assemble-draft.ts";
export * from "./contracts.ts";
export * from "./parse.ts";
