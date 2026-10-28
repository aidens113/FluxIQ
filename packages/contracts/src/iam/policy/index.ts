// Barrel for the IAM policy grammar (IAM-JSON): document kinds, statements,
// action and resource patterns, condition operators and keys, and policy
// variables. Evaluation is Core's (`packages/fluxiq/src/platform/iam/`).
export * from "./condition/index.ts";
export * from "./document.ts";
export * from "./pattern.ts";
export * from "./policy-kind.ts";
export * from "./policy-variables.ts";
export * from "./statement.ts";
