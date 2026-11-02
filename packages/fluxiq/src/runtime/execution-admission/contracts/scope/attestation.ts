import type { ExecutionScopeOwner } from "./owner.ts";

/** Original resource owner's proof; its owner retains the resource lifetime. */
export interface ExecutionScopeAttestation {
  readonly owner: ExecutionScopeOwner;
  readonly proof: object;
}
