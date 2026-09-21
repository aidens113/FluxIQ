// Barrel for flow bootstrap: the plan contract and its validation, the one
// acceptor that turns any shape a model replies in into a plan, the adaptation
// record built from a validated plan, its projection for review, and the
// generation failure taxonomy. The export list matches what runtime/index.ts
// published for these modules before they moved here, plus the review
// projection, which moved out of runtime/service.ts and is published here so
// the service reaches it through this barrel.
export * from "./action-permissions.ts";
export * from "./adaptation.ts";
export * from "./authoring/index.ts";
export * from "./decision-step-ids.ts";
export * from "./generation-failure.ts";
export * from "./plan.ts";
export * from "./review-projection.ts";
