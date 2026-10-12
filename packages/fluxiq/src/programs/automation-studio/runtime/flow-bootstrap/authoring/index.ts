// Barrel for Flow authoring: the format a model writes in, the parser that
// reads it, and the one acceptor that turns any accepted reply into a plan.
//
// `assemble.ts`, `draft-bindings.ts`, `instruction-record-columns.ts`,
// `json-plan.ts`, `issue.ts`, `keys.ts`, `matching.ts`, `normalise.ts`, `plan-locator.ts`,
// `script-locator.ts`,
// `record-output.ts` and `values.ts` are deliberately absent: they are how the acceptor works, not what it offers,
// and publishing them would invite a second place that normalises a plan.
//
// `assemble-draft.ts` is published, and is the one exception, because it is a
// second door rather than a second normaliser: a build that accrued a draft
// hands that draft over instead of a written script, and both go through
// `assemble.ts` from there.
//
// `assembled-record-output.ts` publishes the one record output assembly writes
// on a node, because the build's test has to send that same output for a step
// that ran with none (`../../llm/node-tools/replay.ts`); a second derivation
// there is how the test and the Flow would come to write different datasets.
//
// `instruction-record-columns.ts` publishes one sentence and nothing else: what
// its matcher found unread, said to the build and the judge, so neither grows a
// second matcher.
export * from "./accept.ts";
export * from "./assembled-record-output.ts";
export * from "./assemble-draft.ts";
export * from "./contracts.ts";
export { automationStudioFlowBootstrapDraftUnreadColumnsSentence, automationStudioFlowBootstrapUnreadColumnsSentence } from "./instruction-record-columns.ts";
export * from "./parse.ts";
// The one lookup of where a refusal is in what the model wrote, so every check
// after authoring names the step the same way (`./script-locator.ts` and
// `./plan-locator.ts` build what it reads, and stay unpublished).
export * from "./locate-issue.ts";
