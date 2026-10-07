// Barrel for flow bootstrap: the plan contract and its validation, the one
// acceptor that turns any shape a model replies in into a plan, the adaptation
// record built from a validated plan, its projection for review, and the
// generation failure taxonomy. The export list matches what runtime/index.ts
// published for these modules before they moved here, plus the review
// projection, which moved out of runtime/service.ts and is published here so
// the service reaches it through this barrel.
//
// **`./candidate/` is not re-exported here, and must not be.** Candidate
// authoring drives the evidence loop, so it imports values out of
// `runtime/llm/`; `runtime/llm/` in turn imports this barrel (the DeepSeek
// adapter, the context packet, the draft checks). Re-exporting candidate here
// made this barrel a second entry into `runtime/llm/` and changed the order the
// cycle evaluates in: from t299 (0b5d7543) until t351, the harness barrel was
// still half-evaluated when `runtime/llm/harness.ts` copied its exports, and
// `automationStudioWithoutLocators`, `runAutomationStudioLlmHarness` and
// `automationStudioEvidenceKey` arrived undefined in four test files
// (`generation-failure/tests/provider-*.test.ts` hold the cycle). Import
// candidate from `flow-bootstrap/candidate/index.ts`; `runtime/index.ts`
// publishes it.
export * from "./action-permissions.ts";
export * from "./adaptation.ts";
export * from "./answerability/index.ts";
export * from "./authoring/index.ts";
export * from "./creation-spend/index.ts";
export * from "./decision-step-ids.ts";
export * from "./draft-reduction.ts";
export * from "./evidence-loop-steps.ts";
export * from "./extend.ts";
export * from "./generation-failure/index.ts";
export * from "./incomplete-draft/index.ts";
export * from "./instructed-acts/index.ts";
export * from "./person-needed.ts";
export * from "./plan.ts";
export * from "./reachability/index.ts";
export * from "./review-projection.ts";
export * from "./start-location.ts";
export * from "./unfinished-build/index.ts";
export * from "./verification/index.ts";
