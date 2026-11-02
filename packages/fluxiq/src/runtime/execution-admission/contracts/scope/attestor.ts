import type { ExecutionScopeBinding } from "./binding.ts";
import type { ExecutionScopeAttestation } from "./attestation.ts";

/** Trusted configuration; owns its resources throughout the opened continuation. */
export interface ExecutionScopeAttestor {
  attest(persistedBinding: ExecutionScopeBinding): ExecutionScopeAttestation | null | Promise<ExecutionScopeAttestation | null>;
}
