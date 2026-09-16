import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioChangeProposalPatch } from "../../../model/index.ts";
import { isJsonValue, isRecord } from "./json-bounds.ts";

export type AutomationStudioLlmStructuredResponse =
  | { kind: "flow_bootstrap"; summary: string; plan: AutomationStudioFlowBootstrapPlan; metadata?: JsonObject }
  | { kind: "evidence_tool_decision"; summary: string; decision: { kind: "tool_call"; callId: string; toolId: string; input: JsonObject } | { kind: "complete"; result: JsonObject }; metadata?: JsonObject }
  | { kind: "diagnosis"; summary: string; confidence?: number; metadata?: JsonObject }
  | { kind: "runtime_patch"; summary: string; patches: AutomationStudioRuntimePatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "change_proposal"; summary: string; patches: AutomationStudioChangeProposalPatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "instruction_suggestion"; summary: string; instructions: Array<{ title: string; body: string; scope?: JsonObject; tags?: string[] }>; metadata?: JsonObject };

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

export type AutomationStudioRuntimePatch =
  | { kind: "temporary_action_sequence"; targetNodeId: string; actionDefinitionIds: string[]; reason: string; metadata?: JsonObject }
  | { kind: "temporary_wait_retry"; targetNodeId: string; timeoutMs?: number; retryCount?: number; reason: string; metadata?: JsonObject }
  | { kind: "temporary_target_override"; targetNodeId: string; target: AutomationStudioRuntimeTargetOverrideTarget; reason: string; metadata?: JsonObject }
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
  if (response.kind === "diagnosis") return { kind: response.kind, summary: response.summary, ...(response.confidence !== undefined ? { confidence: response.confidence } : {}) };
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
  if (response.kind === "change_proposal") return { kind: response.kind, riskLevel: response.riskLevel, patchCount: response.patches.length, patchKinds: response.patches.map((patch) => patch.kind) };
  return { kind: response.kind, instructionCount: response.instructions.length };
}
