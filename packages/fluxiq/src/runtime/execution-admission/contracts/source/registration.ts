import type { ExecutionScope } from "../scope/index.ts";
import type { ExecutionOriginRecord } from "../entry/index.ts";
import type { VerifiedExecutionEvidence } from "../evidence.ts";

/** Trusted source-owned readers are called with this original registration as receiver. */
export interface ExecutionSourceRegistration {
  readonly owner: object;
  readonly scope: ExecutionScope;
  readonly sourceKey: string;
  readonly delegatesTo: readonly object[];
  readonly rootPolicy:
    | { readonly kind: "ordinary" }
    | { readonly kind: "trial_series"; readonly seriesKey: string };
  readOrigin(origin: object): ExecutionOriginRecord | null;
  readOrdinaryAdmission(proof: object): { readonly origin: object; readonly callKey: string } | null;
  consumeEvidence(origin: object, evidence: object): VerifiedExecutionEvidence | null;
}
