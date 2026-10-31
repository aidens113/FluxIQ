import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";

/** Validated command arguments only: no replay, write, row/output binding or model annotations. */
export type AutomationStudioLlmRunNodesConcreteInput = JsonObject & {
  node: string;
  parameters: JsonObject;
  consequences: [];
};

/** Private loop provenance. A model call id or a catalog entry cannot produce this record. */
export type AutomationStudioLlmRunNodesPriorCall = {
  callId: string;
  loopId: string;
  toolId: "core.run_node";
  /** Stable library identity, never an execution graph's generated node id. */
  definitionId: string;
  definitionVersion: string;
  /**
   * Private actual-dispatch input after binding, retries and target reacquisition.
   * Never reconstruct from draft/ranWith or model JSON: those may restore extraction handles.
   */
  input: JsonObject;
  /** Privately attested resolved node-port inputs; explicit {} proves no inputs, absence proves nothing. */
  effectiveInputs: JsonObject;
  execution: unknown;
  /** Stable registry/grant epoch shared by equivalent calls, never a call nonce. */
  authorityKey: string;
  /** Trusted execution floor, including the canonical output's floor. */
  actionEffect: AutomationStudioResolvedActionEffect;
  /** Any stronger floor established by the execution's actual effects. */
  observedEffect?: AutomationStudioResolvedActionEffect | undefined;
};

/** The immutable authority and arguments the coordinator accepted before dispatch. */
export type AutomationStudioLlmRunNodesOriginal = Readonly<{
  callId: string;
  loopId: string;
  definitionId: string;
  definitionVersion: string;
  input: AutomationStudioLlmRunNodesConcreteInput;
  effectiveInputs: JsonObject;
  authorityKey: string;
  resultCode: string | undefined;
  actionEffect: AutomationStudioResolvedActionEffect;
  observedEffect?: AutomationStudioResolvedActionEffect | undefined;
}>;

/** Re-read from the owning registry and permission context before each member. */
export type AutomationStudioLlmRunNodesAuthority = {
  definitionId: string;
  definitionVersion: string;
  authorityKey: string;
  observedEffect?: AutomationStudioResolvedActionEffect | undefined;
};

export type AutomationStudioLlmRunNodesAllowance =
  | { allowed: true }
  | { allowed: false; reason: "cancelled" | "tool_calls" | "time" | "purse" | "unavailable" };

/** INTERNAL resolved data, captured once before any member; never serialize as model evidence. */
export type AutomationStudioLlmRunNodesIdentity = Readonly<{
  input: JsonObject;
  key: string;
}>;

export type AutomationStudioLlmRunNodesStopReason =
  | "input_invalid"
  | "duplicate_call"
  | "unknown_call"
  | "provenance_unreadable"
  | "ineligible_original"
  | "authority_unavailable"
  | "authority_changed"
  | "effect_unavailable"
  | "unsafe_effect"
  | "list_guard_refused"
  | "list_guard_unreadable"
  | "list_guard_record_failed"
  | "allowance_unreadable"
  | "cancelled"
  | "tool_calls"
  | "time"
  | "purse"
  | "unavailable"
  | "invalid_result"
  | "failed_result"
  | "person_needed"
  | "uncertain_result"
  | "result_code_changed"
  | "member_threw";

/** Private raw receipts/errors: D applies ordinary screening, never serializes this control object as evidence. */
export type AutomationStudioLlmRunNodesMemberReceipt =
  | { index: number; priorCallId: string; kind: "returned"; callId: string; result: unknown }
  | { index: number; priorCallId: string; kind: "threw"; error: unknown };

/** INTERNAL controls/receipts, never a public tool result; D publishes only a closed screened summary. */
export type AutomationStudioLlmRunNodesResult = {
  kind: "completed" | "rejected" | "stopped";
  requested: readonly string[];
  executed: readonly AutomationStudioLlmRunNodesMemberReceipt[];
  skipped: readonly string[];
  /** Zero-based requested index; a post-list record failure uses requested.length and no priorCallId. */
  stop?: { index: number; priorCallId?: string | undefined; reason: AutomationStudioLlmRunNodesStopReason } | undefined;
  /** Private guard control; includes actual dispatch authority/inputs and must never be sent to the model. */
  identity?: AutomationStudioLlmRunNodesIdentity | undefined;
  /** A failed record never erases receipts or the original stopping reason. D must end the batch path. */
  listRecord?: "recorded" | "failed";
};

export type AutomationStudioLlmRunNodesPorts = {
  /** Must consult this live loop's private actual-dispatch originals, including exploration; JSON ids grant nothing. */
  lookupPriorCall(callId: string): AutomationStudioLlmRunNodesPriorCall | undefined;
  /**
   * Compare the frozen original to current authoritative registry/version/grants.
   * Refuse any effective-input dependency not accounted for by trusted effect/authority contracts.
   */
  resolveAuthority(original: AutomationStudioLlmRunNodesOriginal): AutomationStudioLlmRunNodesAuthority | undefined | Promise<AutomationStudioLlmRunNodesAuthority | undefined>;
  /**
   * Resolve the canonical execution node, never model metadata or consequence claims.
   * Params-only is sufficient only for trusted params-only declarations; authority refuses unaccounted inputs.
   */
  resolveRerunEffect?: ((definitionId: string, concreteParameters: JsonObject) => AutomationStudioResolvedActionEffect | undefined | Promise<AutomationStudioResolvedActionEffect | undefined>) | undefined;
  /**
   * The ordinary fully wrapped/accounted core.run_node path. It owns fresh call-id allocation,
   * admission, retries, receipts, permissions, uncertainty and the same purse. It adds no draft step.
   * It reruns the private frozen dispatch provenance, never a model/restored ranWith input.
   * value/original/effectiveInputs are INTERNAL resolved data, not public decision JSON.
   * D keeps the original public request for wrappers/traces and carries frozen dispatch in a private scope.
   * Do not substitute native execution, and do not throw away a receipt if a later observer fails.
   */
  runMember(request: { index: number; original: AutomationStudioLlmRunNodesOriginal; value: JsonObject; signal?: AbortSignal | undefined }): Promise<{ callId: string; result: unknown }>;
  /** Existing cancellation/tool/time/purse checks; this coordinator introduces no numeric cap. */
  allowance(): AutomationStudioLlmRunNodesAllowance | Promise<AutomationStudioLlmRunNodesAllowance>;
  listGuard: {
    /** Check once before dispatch using the captured world/authority identity. */
    admit(identity: AutomationStudioLlmRunNodesIdentity): boolean | Promise<boolean>;
    /** Record once after an admitted list completes/stops, alongside each member's ordinary guards. */
    recorded(identity: AutomationStudioLlmRunNodesIdentity, result: AutomationStudioLlmRunNodesResult): void | Promise<void>;
  };
};

/** INTERNAL coordinator request. Only its untrusted value is the model's {calls} input. */
export type AutomationStudioLlmRunNodesInput = {
  loopId: string;
  /** Untrusted model input: only {calls:[priorCallId,...]} is accepted. */
  value: unknown;
  /** Existing world/authority guard context at list admission, frozen before member 1. */
  world: JsonObject;
  ports: AutomationStudioLlmRunNodesPorts;
  signal?: AbortSignal | undefined;
};
