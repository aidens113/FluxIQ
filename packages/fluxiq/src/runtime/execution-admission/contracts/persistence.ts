import type { ExecutionScopeBinding, StoredExecutionScope } from "./scope/index.ts";
import type { ExecutionEntryRow } from "./entry/index.ts";
import type { ExecutionInspection } from "./inspection/index.ts";
import type { ExecutionSourceRegistration } from "./source/index.ts";
import type { VerifiedExecutionEvidence } from "./evidence.ts";

/** Trusted durable adapter. Finish must derive and CAS-check the actual child frontier. */
export interface ExecutionAdmissionPersistence {
  open(input: {
    readonly binding: ExecutionScopeBinding;
    readonly baseline: "complete" | "unverified";
    readonly baselineProofDigest: string;
  }): Promise<StoredExecutionScope>;
  inspect(scopeId: string): Promise<ExecutionInspection>;
  reserve(input: {
    readonly root: ExecutionEntryRow;
    readonly ordinaryCallKey: string;
    readonly policy: ExecutionSourceRegistration["rootPolicy"];
  }): Promise<{ readonly fenceGeneration: string }>;
  enter(input: { readonly entry: ExecutionEntryRow; readonly fenceGeneration: string }): Promise<void>;
  append(input: {
    readonly entryId: string;
    readonly evidence: Exclude<VerifiedExecutionEvidence, { readonly kind: "coverage_complete" }>;
  }): Promise<void>;
  finish(input: {
    readonly entryId: string;
    readonly evidence: Extract<VerifiedExecutionEvidence, { readonly kind: "coverage_complete" }>;
  }): Promise<void>;
  release(input: { readonly rootId: string; readonly ownerIncarnation: string }): Promise<void>;
}
