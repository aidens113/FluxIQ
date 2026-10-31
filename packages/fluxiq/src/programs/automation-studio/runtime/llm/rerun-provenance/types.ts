import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../loop-configuration.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";

/** Closed host-local failures: never a producer's payload or error message. */
export type AutomationStudioLlmRerunUnavailableReason =
  | "inactive" | "not_capturing" | "capture_closed" | "capture_conflict"
  | "invalid_snapshot" | "effective_inputs_unproven" | "dispatch_unproven"
  | "reference_changed" | "capture_missing" | "result_unproven"
  | "scope_unavailable" | "scope_unreadable" | "scope_changed" | "disposed"
  | "duplicate_call" | "tool_unavailable" | "foreign_record" | "record_missing"
  | "adapter_changed" | "adapter_input_changed" | "capsule_changed"
  | "execution_closed" | "capsule_consumed" | "capsule_unconsumed"
  | "assessment_unproven" | "assessment_vetoed";

export type AutomationStudioLlmRerunUnavailable = Readonly<{
  kind: "unavailable";
  reason: AutomationStudioLlmRerunUnavailableReason;
}>;

/** Actual dispatch attempts, including the one whose payload the capsule holds. */
export type AutomationStudioLlmRerunDispatchAttempt = Readonly<{
  identity: object;
  receipt?: object;
  outcome: "succeeded" | "failed_unacted" | "uncertain" | "unknown";
}>;

/** Submitted only by the trusted producer, never obtained from result JSON. */
export type AutomationStudioLlmRerunCaptureSnapshot = Readonly<{
  owner: object;
  generation: object;
  definitionId: string;
  definitionVersion: string;
  parameters: JsonObject;
  effectiveInputs: JsonObject;
  /** The actual input at the adapter, after deterministic outer wrapping. */
  adapterValue: JsonObject;
  referenceNow: number;
  subject: object;
  capsule: object;
  dispatch: Readonly<{
    attempts: readonly AutomationStudioLlmRerunDispatchAttempt[];
    selected: object;
  }>;
}>;

export type AutomationStudioLlmRerunCaptureAccess = Readonly<{
  kind: "capture";
  publish(snapshot: AutomationStudioLlmRerunCaptureSnapshot): Readonly<{ kind: "accepted" }> | AutomationStudioLlmRerunUnavailable;
}> | AutomationStudioLlmRerunUnavailable;

export type AutomationStudioLlmRerunExecutionInput = Readonly<{
  owner: object;
  generation: object;
  value: JsonObject;
}>;

export type AutomationStudioLlmRerunExecutionRefused = Readonly<{
  kind: "refused";
  reason: AutomationStudioLlmRerunUnavailableReason;
}>;

/** A refused active scope MUST NOT fall through to ordinary handle resolution. */
export type AutomationStudioLlmRerunExecutionAccess =
  | Readonly<{ kind: "ordinary" }>
  | AutomationStudioLlmRerunExecutionRefused
  | Readonly<{
    kind: "selected";
    /** Nonenumerable; the adapter must also verify its own identity registry. */
    capsule: object;
    consume(capsule: object): Readonly<{ kind: "consumed" }> | AutomationStudioLlmRerunExecutionRefused;
    /** Fresh trusted actual main attempts; acknowledgement alone proves no dispatch. */
    reportDispatch?(capsule: object, dispatch: AutomationStudioLlmRerunCaptureSnapshot["dispatch"]): Readonly<{ kind: "accepted" }> | AutomationStudioLlmRerunExecutionRefused;
  }>;

// Everything below this point is Core-private and is NOT an SDK export.
export type AutomationStudioLlmRerunScope = Readonly<{
  loop: object;
  binding: object;
  generation: object;
  registry: object;
  authority: object;
}>;

export type AutomationStudioLlmRerunExecutor = AutomationStudioLlmEvidenceLoopInput["executeTool"];
export type AutomationStudioLlmRerunRequest = Parameters<AutomationStudioLlmRerunExecutor>[0];
export type AutomationStudioLlmRerunResult = Awaited<ReturnType<AutomationStudioLlmRerunExecutor>>;

/** Every field is nonenumerable. Only the owning closure can select this record. */
export type AutomationStudioLlmRerunRecord = Readonly<{
  callId: string;
  toolId: "core.run_node";
  definitionId: string;
  definitionVersion: string;
  parameters: JsonObject;
  effectiveInputs: JsonObject;
  /** Trusted opaque semantic identity; retained by reference, never serialized. */
  subject: object;
  referenceNow: number;
  resultCode: string | undefined;
  /** Actual completed primary assessment and every auxiliary floor; absence is unproven. */
  observedEffect?: AutomationStudioResolvedActionEffect;
  originalValue: JsonObject;
  execution: AutomationStudioLlmRerunResult;
}>;

export type AutomationStudioLlmRerunLookup = Readonly<{
  kind: "available";
  record: AutomationStudioLlmRerunRecord;
}> | AutomationStudioLlmRerunUnavailable;

/** A returned value is private/nonenumerable and still needs ordinary settlement. */
export type AutomationStudioLlmRerunOutcome = (
  | AutomationStudioLlmRerunUnavailable
  | Readonly<{ kind: "returned"; result: AutomationStudioLlmRerunResult }>
  | Readonly<{ kind: "unproven"; reason: AutomationStudioLlmRerunUnavailableReason; result: AutomationStudioLlmRerunResult }>
  | Readonly<{ kind: "threw"; error: unknown }>
) & Readonly<{
  main: "unacted" | "unproven" | "receipt";
  dispatch?: AutomationStudioLlmRerunCaptureSnapshot["dispatch"];
}>;

export type AutomationStudioLlmRerunProvenance = Readonly<{
  capture(request: AutomationStudioLlmRerunRequest, wrappedExecuteTool: AutomationStudioLlmRerunExecutor): Promise<AutomationStudioLlmRerunResult>;
  lookup(callId: string): AutomationStudioLlmRerunLookup;
  execute(record: AutomationStudioLlmRerunRecord, request: Readonly<{ callId: string; signal?: AbortSignal }>): Promise<AutomationStudioLlmRerunOutcome>;
  dispose(): void;
}>;
