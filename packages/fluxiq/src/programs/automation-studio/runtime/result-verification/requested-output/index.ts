// The answer a build declared its task asks for, held against what a run
// stored (t757).
//
// Auction `run-mveba82m-fd0616dc` asked for one listing's title, price and
// postage as a record with three columns. The Flow chose the wrong listing,
// read three values one by one and stored no record set; both trial judges and
// the finished run's judge answered yes at 0.9 with `recordSetCount 0` in
// their packets, and the Flow was promoted and reported passed. Nothing typed
// said the request wanted records, and a rule that read "record" or "columns"
// in the request's words would be Core guessing at a request it cannot read,
// and would wrongly refuse the action-only and honestly empty requests that a
// zero-record yes rightly answers (`../core-observation.ts` says why an empty
// result goes to a model at all).
//
// So the obligation is the build's own typed declaration: a task spec part's
// `answer: { kind: "records", columns }` (`project-agents/contracts/task-spec.ts`),
// which a project build's judge receives on its checklist
// (`../build-test/task-checklist.ts`), or which a caller holding it passes as
// `requestedOutput` (`../verify.ts`). Where a part owes records and the run
// stored none, a yes is not a yes (`./held-yes.ts`): it becomes `unsure`,
// `core.result.requested_output_missing`, carrying Core's finding
// (`requestedOutputMissing`) and its sentence as the reason, so a build's
// trial is not promoted on it and is told what is missing, and a finished run
// fails rather than reporting passed. A first yes so held is not asked again
// for its confirmation: the record would not change (`../verify.ts`).
//
// An empty answer stays a yes only where the run's own record shows it honest
// (`./honestly-empty.ts`): a read that saw its list end and kept nothing, or
// reads that all saw their lists end and an answer that kept none of their
// rows. A build test, which stores nothing itself, is held to what its Flow
// would store; where that was not worked out, nothing is held. A part with no
// declared answer owes nothing, and a yes on it is judged as it always was.

export { automationStudioResultHonestlyEmpty } from "./honestly-empty.ts";
export { automationStudioResultRequestedOutputHeld } from "./held-yes.ts";
export { automationStudioResultRequestedOutputMissing } from "./missing.ts";
export { automationStudioResultRequestedOutputOwed } from "./owed.ts";
