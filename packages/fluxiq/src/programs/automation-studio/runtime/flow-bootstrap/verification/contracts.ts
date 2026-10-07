import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

export type AutomationStudioCandidateRequirementPredicate =
  | { readonly kind: "exists"; readonly field: string }
  | { readonly kind: "equals"; readonly field: string; readonly value: JsonValue }
  | { readonly kind: "contains"; readonly field: string; readonly value: JsonValue }
  | { readonly kind: "count_equals" | "count_at_least"; readonly field: string; readonly value: number };

/** Trusted interpretation of original instructions, never a builder annotation. */
export type AutomationStudioCandidateRequirementBrief = {
  /** Trusted instruction interpretation; absent/partial never permits promotion. */
  readonly interpretationStatus?: "complete" | "partial";
  readonly instructions: readonly { readonly instructionId: string; readonly text: string }[];
  readonly requirements: readonly {
    readonly requirementId: string;
    readonly source: { readonly instructionId: string; readonly start: number; readonly end: number };
    readonly mode: "create" | "ensure";
    readonly subjects: { readonly kind: "explicit"; readonly subjectIds: readonly string[] } | { readonly kind: "all"; readonly scopeId: string; readonly minimumSubjects?: number };
    readonly predicates: readonly AutomationStudioCandidateRequirementPredicate[];
  }[];
};

export type AutomationStudioCandidateVerificationIdentity = {
  readonly projectId: string;
  readonly flowId: string;
  readonly revision: number;
  readonly digest: string;
  readonly baseDependencyDigest: string;
  readonly requirementsDigest: string;
};

/** Prepared by the trusted reset/start adapter, not inferred from navigation. */
export type AutomationStudioCandidateStartReceipt = {
  readonly receiptId: string;
  readonly conditionsDigest: string;
  readonly preparedAt: number;
  readonly pageGeneration: number;
  readonly subjectStates: readonly { readonly observationId: string; readonly subjectId: string; readonly existed: boolean; readonly observedAt: number; readonly pageGeneration: number }[];
};

export type AutomationStudioCandidateExecutionReceipt = {
  readonly identity: AutomationStudioCandidateVerificationIdentity;
  readonly runId: string;
  readonly startReceiptId: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly status: "succeeded" | "failed" | "cancelled" | "not_run";
  readonly executedNodeCount: number;
  readonly commands: readonly {
    readonly commandId: string;
    readonly subjectIds: readonly string[];
    readonly outcome: "performed" | "withheld" | "no_op" | "unknown";
    readonly finishedAt: number;
  }[];
};

/** Only the independent observer port may produce this packet. */
export type AutomationStudioCandidateObservedEvidence = {
  readonly identity: AutomationStudioCandidateVerificationIdentity;
  readonly runId: string;
  readonly startReceiptId: string;
  readonly observations: readonly {
    readonly observationId: string;
    readonly pageGeneration: number;
    readonly observedAt: number;
    readonly subjectId: string;
    readonly fields: JsonObject;
    readonly completeFields: readonly string[];
    readonly newlyProduced?: { readonly commandId: string; readonly startObservationId: string };
  }[];
  readonly enumerations: readonly { readonly observationId: string; readonly pageGeneration: number; readonly observedAt: number; readonly scopeId: string; readonly subjectIds: readonly string[]; readonly complete: boolean }[];
};

export type AutomationStudioCandidateRequirementResult = {
  readonly requirementId: string;
  readonly outcome: "satisfied" | "unsatisfied" | "unknown";
  readonly codes: readonly string[];
  readonly observationIds: readonly string[];
};

export type AutomationStudioCandidateVerificationReceipt = {
  readonly schemaVersion: "candidate.verification.v1";
  readonly receiptId: string;
  readonly identity: AutomationStudioCandidateVerificationIdentity;
  readonly runId: string;
  readonly startReceipt: AutomationStudioCandidateStartReceipt;
  readonly execution: AutomationStudioCandidateExecutionReceipt;
  readonly evidence: AutomationStudioCandidateObservedEvidence;
  readonly requirements: readonly AutomationStudioCandidateRequirementResult[];
  readonly verdict: "satisfied" | "unsatisfied" | "unknown";
};

export type AutomationStudioCandidateVerificationOutcome =
  | { readonly status: "promoted"; readonly receipt: AutomationStudioCandidateVerificationReceipt }
  | { readonly status: "draft"; readonly code: string; readonly receipt?: AutomationStudioCandidateVerificationReceipt };

export type AutomationStudioCandidateVerificationPorts = {
  /** Reread candidate, requirements and accepted base from their current owners. */
  currentIdentity(): Promise<AutomationStudioCandidateVerificationIdentity | null>;
  prepareStart(input: { identity: AutomationStudioCandidateVerificationIdentity; conditionsDigest: string; signal?: AbortSignal }): Promise<AutomationStudioCandidateStartReceipt>;
  /** Runs the exact detached graph/topology via the normal executor, never applies it. */
  execute(input: { identity: AutomationStudioCandidateVerificationIdentity; runId: string; start: AutomationStudioCandidateStartReceipt; signal?: AbortSignal }): Promise<AutomationStudioCandidateExecutionReceipt>;
  /** Independently captures required fields/coverage; builder success fields are not arguments. */
  observe(input: { identity: AutomationStudioCandidateVerificationIdentity; execution: AutomationStudioCandidateExecutionReceipt; brief: AutomationStudioCandidateRequirementBrief; start: AutomationStudioCandidateStartReceipt; signal?: AbortSignal }): Promise<AutomationStudioCandidateObservedEvidence>;
  /** MUST retain normal apply-time authorization/validation and atomically compare candidate/requirements/base, honor signal, and dedupe receiptId durably. */
  promote(input: { expectedIdentity: AutomationStudioCandidateVerificationIdentity; expectedBaseDigest: string; idempotencyKey: string; receipt: AutomationStudioCandidateVerificationReceipt; signal?: AbortSignal }): Promise<"promoted" | "already_promoted" | "stale" | "unsupported_storage_authority">;
};
