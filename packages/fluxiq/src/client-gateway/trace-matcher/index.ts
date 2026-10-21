// The client gateway trace matcher (traces and offline trials, P4b): a
// scoped session's client answered from a recorded trace by strict matching of
// each action command against the recorded operations, feeding the recorded
// answers and inputs through the gateway's own intake on the trial's clock,
// and answering anything the trace cannot support with a classified evidence
// gap. Domain-neutral; exported from `client-gateway/index.ts` only.
export type * from "./types.ts";
export * from "./gap-reasons.ts";
export * from "./operation/index.ts";
export * from "./contract-compatibility.ts";
export * from "./gap-answer.ts";
export * from "./command-id-translation.ts";
export * from "./recorded-deliveries.ts";
export * from "./trace-admission.ts";
export * from "./matcher.ts";
