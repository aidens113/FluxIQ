import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioChangeProposalPatch } from "../../../model/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { isJsonValue, isRecord } from "./json-bounds.ts";

import type { AutomationStudioFlowDraftAmendment } from "../../flow-draft/index.ts";

export type AutomationStudioLlmStructuredResponse =
  | { kind: "flow_bootstrap"; summary: string; plan: AutomationStudioFlowBootstrapPlan; metadata?: JsonObject }
  | { kind: "evidence_tool_decision"; summary: string; decision: { kind: "tool_call"; callId: string; toolId: string; input: JsonObject } | { kind: "complete"; result: JsonObject } | { kind: "amend_draft"; amendments: AutomationStudioFlowDraftAmendment[] }; metadata?: JsonObject }
  | { kind: "diagnosis"; summary: string; confidence?: number; diagnosis?: AutomationStudioLlmDiagnosisFields; metadata?: JsonObject }
  | { kind: "runtime_patch"; summary: string; patches: AutomationStudioRuntimePatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "no_repair"; summary: string; reason: AutomationStudioNoRepairReason; metadata?: JsonObject }
  | { kind: "change_proposal"; summary: string; patches: AutomationStudioChangeProposalPatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "instruction_suggestion"; summary: string; instructions: Array<{ title: string; body: string; scope?: JsonObject; tags?: string[] }>; metadata?: JsonObject };

/**
 * Why there is nothing to repair, in the five ways a page says no.
 *
 * A model asked for a runtime patch had no way to answer "there is no repair":
 * under a `diagnose_and_adapt` grant the schema was one target override with at
 * least one handle and no other shape, so the only schema-valid answer was a
 * control -- and in the live repair campaign of 2026-09-17 every refusal task
 * came back with one that was merely pressable. This is the answer that was
 * missing. It is a closed list because a reason a run records is read by a
 * person and matched on by the Lab, and free prose is neither.
 *
 * It is deliberately not the target-override refusal vocabulary
 * (`runtime/live-patch/refusal-reasons.ts`): those words say why a domain
 * refused a target the model proposed, and these say why the model proposed
 * none. A refusal Core reached and a refusal the model reached are different
 * facts about a run.
 */
export const AUTOMATION_STUDIO_NO_REPAIR_REASONS = Object.freeze({
  control_gone: "what the step acted on is gone, and nothing takes its place",
  control_refused: "it is still there and refuses the step on purpose: locked, read-only, guarded, or not signed in",
  several_alike: "several things answer to the step's own description and nothing tells them apart",
  destination_gone: "where the step led is gone, and nothing replaces it",
  person_required: "only a person can settle this"
} as const);

export type AutomationStudioNoRepairReason = keyof typeof AUTOMATION_STUDIO_NO_REPAIR_REASONS;

export function isAutomationStudioNoRepairReason(value: unknown): value is AutomationStudioNoRepairReason {
  return typeof value === "string" && Object.hasOwn(AUTOMATION_STUDIO_NO_REPAIR_REASONS, value);
}

/**
 * The one channel through which a model may contribute to a diagnosis.
 *
 * Every response's `metadata` is stripped on the way in, deliberately: it is an
 * open field and an open field is a way to smuggle arbitrary JSON past the
 * recognized-field allowlist. That left no channel at all, so the structured
 * diagnosis the runtime builds was entirely Core's own verdicts and the model's
 * answer was a sentence of prose nobody could act on.
 *
 * This is the narrow replacement: a named field, with a fixed set of keys, each
 * bounded to a value Core can check without knowing anything about the medium
 * the failure happened in. It is a channel, not an opening -- `metadata` is
 * still stripped, and an unrecognized key inside `diagnosis` is still refused.
 */
export type AutomationStudioLlmDiagnosisFields = {
  /** What the run was supposed to achieve, in the model's words. */
  expected?: string;
  /** What it observed instead. */
  observed?: string;
  /** What the model thinks changed between the two. */
  changed?: string;
  /** Whether the goal is still reachable. Core refuses an answer here that would talk it past a control a person must clear. */
  stillAchievable?: "yes" | "no" | "unknown";
  /** Whether a deterministic recovery Core already holds would serve. */
  deterministicRecoveryPossible?: "yes" | "no" | "unknown";
  /** Whether more evidence is needed before anything is changed. */
  explorationNeeded?: boolean;
  /** Whether a change to the Flow is needed at all. The one field that can stop the patch call. */
  patchNeeded?: boolean;
  /**
   * Whether the result a finished run produced answers what was asked for.
   *
   * The one field a `loop_verification` call is made for, and the reason that
   * call needs no response kind of its own: it is the same three words as the
   * two verdicts above, read the same way. `yes` answers, `no` does not, and
   * `unknown` -- like an omitted field -- is a run nobody confirmed, which the
   * result verification fails closed on rather than letting it read as a pass.
   */
  answersRequest?: "yes" | "no" | "unknown";
};

/**
 * The bound on each description the model may supply.
 *
 * It is the same 500 characters the runtime's reader holds the field to, stated
 * here as well because the two checks answer different questions: this one
 * refuses the response at the boundary, and the reader's records a refusal on
 * the run. A reader that is the only bound would accept an oversized field into
 * the process first.
 */
export const AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH = 500;

/**
 * The vocabulary an opaque handle may use, and nothing wider.
 *
 * A handle is a name, not a path: no whitespace, no brackets, no quotes, no
 * combinators, no slashes, no parentheses. That is deliberately narrower than
 * "a bounded string", because the whole point of the handle is that it cannot
 * carry structure. A domain that wants to say *where* something is says it in
 * its own resolution, on the domain's side of this boundary, never here.
 */
export const AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN = "^[A-Za-z0-9](?:[A-Za-z0-9_.:-]*[A-Za-z0-9])?$";
export const AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH = 64;
export const AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES = 16;
export const AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH = 4_000;

const AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_EXPRESSION = new RegExp(AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN, "u");

/**
 * A repair target, opaque to Core.
 *
 * `handles` is the only part of it Core and a domain agree on: a map from a
 * repairable parameter the domain declared -- one control to re-point, or a
 * list row and its fields for an extraction -- to an opaque handle the domain
 * minted and named in the evidence it issued. Core bounds both sides of that
 * map and reads neither. What a handle points at is the domain's business.
 *
 * Every other key is the domain's own resolution of those handles, in the
 * domain's own vocabulary, written only after the domain has checked the
 * handle against evidence it actually issued. Core carries it and never looks
 * inside, which is what makes this type domain-neutral rather than a browser
 * concept wearing a neutral name: it was `{ selector: string }`, and a
 * non-browser domain had no way to answer it.
 *
 * A model-authored target carries `handles` and nothing else. That is not a
 * convention, it is enforced twice --
 * `isAutomationStudioModelAuthoredTargetOverrideTarget` at the provider and at
 * output validation, and `additionalProperties: false` in the response schema
 * -- so a locator can never enter through the model, only through a domain
 * that resolved one from its own evidence.
 */
export type AutomationStudioRuntimeTargetOverrideTarget = JsonObject & {
  handles: Record<string, string>;
};

/**
 * A runtime patch as a model writes it.
 *
 * `consequences` is what an acting patch says it would lastingly do each time
 * the Flow runs, in Core's classes, `[]` when it only opens, shows or chooses.
 * The schema a model is shown requires it wherever the patch may run, and the
 * recovery's permission gate is asked about it before the patch does. It is
 * optional here because it is read forgivingly: a patch that left it out is
 * recorded as undeclared and does not run, rather than the whole answer being
 * refused, and a proposal-only patch never carries it.
 */
export type AutomationStudioRuntimePatch =
  | { kind: "temporary_action_sequence"; targetNodeId: string; actionDefinitionIds: string[]; consequences?: AutomationStudioActionConsequence[]; reason: string; metadata?: JsonObject }
  | { kind: "temporary_wait_retry"; targetNodeId: string; timeoutMs?: number; retryCount?: number; reason: string; metadata?: JsonObject }
  | { kind: "temporary_target_override"; targetNodeId: string; target: AutomationStudioRuntimeTargetOverrideTarget; consequences?: AutomationStudioActionConsequence[]; reason: string; metadata?: JsonObject }
  | { kind: "temporary_recovery_subflow_call"; subflowId: string; reason: string; metadata?: JsonObject }
  | { kind: "temporary_reroute"; fromNodeId: string; toNodeId: string; reason: string; metadata?: JsonObject };

/**
 * A target Core will carry: bounded handles, and a domain resolution bounded
 * only by size. Core checks that it is JSON and that it is small; it does not
 * and must not check what the domain put in it.
 */
export function isAutomationStudioRuntimeTargetOverrideTarget(value: unknown): value is AutomationStudioRuntimeTargetOverrideTarget {
  if (!isRecord(value) || !isRecord(value.handles) || !isJsonValue(value)) return false;
  const entries = Object.entries(value.handles);
  if (entries.length === 0 || entries.length > AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES) return false;
  if (!entries.every(([parameter, handle]) => isRuntimeTargetHandleToken(parameter) && isRuntimeTargetHandleToken(handle))) return false;
  return serializedLength(value) <= AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH;
}

/**
 * The stricter guard a model's own output must pass: handles, and nothing
 * else. A domain resolution is not something a model may author, so the one
 * place a locator could otherwise reach an executed action is closed here.
 */
export function isAutomationStudioModelAuthoredTargetOverrideTarget(value: unknown): value is AutomationStudioRuntimeTargetOverrideTarget {
  return isRecord(value) && Object.keys(value).length === 1 && Object.hasOwn(value, "handles")
    && isAutomationStudioRuntimeTargetOverrideTarget(value);
}

function isRuntimeTargetHandleToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH
    && AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_EXPRESSION.test(value);
}

function serializedLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function stripAutomationStudioLlmResponseMetadata(response: AutomationStudioLlmStructuredResponse): AutomationStudioLlmStructuredResponse {
  if (response.kind === "flow_bootstrap") return { kind: response.kind, summary: response.summary, plan: response.plan };
  if (response.kind === "evidence_tool_decision") return { kind: response.kind, summary: response.summary, decision: response.decision };
  // `diagnosis` is carried and `metadata` is not. The strip stays a named-field
  // allowlist rather than becoming "keep what the model sent": every key inside
  // `diagnosis` was checked by name at the boundary, and `metadata` was not.
  if (response.kind === "diagnosis") return { kind: response.kind, summary: response.summary, ...(response.confidence !== undefined ? { confidence: response.confidence } : {}), ...(response.diagnosis !== undefined ? { diagnosis: response.diagnosis } : {}) };
  if (response.kind === "runtime_patch") {
    return {
      kind: response.kind,
      summary: response.summary,
      riskLevel: response.riskLevel,
      patches: response.patches.map((patch) => {
        const { metadata: _metadata, ...recognized } = patch;
        return recognized;
      })
    };
  }
  if (response.kind === "no_repair") return { kind: response.kind, summary: response.summary, reason: response.reason };
  if (response.kind === "change_proposal") {
    return {
      kind: response.kind,
      summary: response.summary,
      riskLevel: response.riskLevel,
      patches: response.patches.map((patch) => {
        const { metadata: _metadata, ...recognized } = patch;
        return recognized;
      })
    };
  }
  return {
    kind: response.kind,
    summary: response.summary,
    instructions: response.instructions.map((instruction) => ({
      title: instruction.title,
      body: instruction.body,
      ...(instruction.scope ? { scope: instruction.scope } : {}),
      ...(instruction.tags ? { tags: instruction.tags } : {})
    }))
  };
}

export function summarizeAutomationStudioLlmResponse(response: AutomationStudioLlmStructuredResponse): JsonObject {
  if (response.kind === "flow_bootstrap") return { kind: response.kind, subflowCount: response.plan.subflows.length, nodeCount: response.plan.subflows.reduce((count, subflow) => count + subflow.nodes.length, 0), edgeCount: response.plan.subflows.reduce((count, subflow) => count + subflow.edges.length, 0) };
  if (response.kind === "evidence_tool_decision") return { kind: response.kind, decisionKind: response.decision.kind, ...(response.decision.kind === "tool_call" ? { toolId: response.decision.toolId } : {}) };
  if (response.kind === "diagnosis") return { kind: response.kind, ...(response.confidence !== undefined ? { confidence: response.confidence } : {}) };
  if (response.kind === "runtime_patch") return { kind: response.kind, riskLevel: response.riskLevel, patchCount: response.patches.length, patchKinds: response.patches.map((patch) => patch.kind) };
  if (response.kind === "no_repair") return { kind: response.kind, reason: response.reason };
  if (response.kind === "change_proposal") return { kind: response.kind, riskLevel: response.riskLevel, patchCount: response.patches.length, patchKinds: response.patches.map((patch) => patch.kind) };
  return { kind: response.kind, instructionCount: response.instructions.length };
}
