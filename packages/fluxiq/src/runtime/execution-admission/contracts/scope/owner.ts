import type { ExecutionScopeBinding } from "./binding.ts";

export interface ExecutionScopeOwner {
  readBinding(proof: object): {
    readonly binding: ExecutionScopeBinding;
    readonly baseline: "complete" | "unverified";
    readonly baselineProofDigest: string;
  } | null;
}
