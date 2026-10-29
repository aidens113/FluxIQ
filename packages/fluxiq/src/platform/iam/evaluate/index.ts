// Barrel for the IAM policy evaluator: compile a principal's policy set once,
// decide requests against it with AWS IAM semantics, and check a role's trust
// policy. Pure and deterministic; no storage, clock or network.
export { compileIamPolicySet } from "./compile/index.ts";
export * from "./evaluate-iam-request.ts";
export * from "./iam-trust-allows.ts";
export type { CompiledIamPolicySet } from "./types.ts";
