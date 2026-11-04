// The trace state rule (Answer First, Engine lane step 1): a Flow's commands answered
// from one exploration's recording by page position and acts done, in place of the
// matcher's strict cursor, with a pure verdict over the walk. The go/no-go harness
// (`offline-trial-experiment` in the web repository) measures it on saved traces. Not
// wired into any live path. Domain-neutral: labelling, canonical keys and reading an
// answer go through `ClientGatewayTraceStateDomain`. Exported from
// `client-gateway/index.ts` only.
export type * from "./types.ts";
export * from "./gap-codes.ts";
export * from "./bookkeeping-calls.ts";
export * from "./recorded-calls.ts";
export * from "./recording.ts";
export * from "./walker.ts";
export * from "./end-check.ts";
export * from "./verdict.ts";
