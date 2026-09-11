import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioChangeProposalPatch } from "../../../model/index.ts";
import { isRecord } from "./json-bounds.ts";

export type AutomationStudioLlmStructuredResponse =
  | { kind: "flow_bootstrap"; summary: string; plan: AutomationStudioFlowBootstrapPlan; metadata?: JsonObject }
  | { kind: "evidence_tool_decision"; summary: string; decision: { kind: "tool_call"; callId: string; toolId: string; input: JsonObject } | { kind: "complete"; result: JsonObject }; metadata?: JsonObject }
  | { kind: "diagnosis"; summary: string; confidence?: number; metadata?: JsonObject }
  | { kind: "runtime_patch"; summary: string; patches: AutomationStudioRuntimePatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "change_proposal"; summary: string; patches: AutomationStudioChangeProposalPatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "instruction_suggestion"; summary: string; instructions: Array<{ title: string; body: string; scope?: JsonObject; tags?: string[] }>; metadata?: JsonObject };

export type AutomationStudioRuntimeTargetOverrideTarget = {
  selector: string;
};

export type AutomationStudioRuntimePatch =
  | { kind: "temporary_action_sequence"; targetNodeId: string; actionDefinitionIds: string[]; reason: string; metadata?: JsonObject }
  | { kind: "temporary_wait_retry"; targetNodeId: string; timeoutMs?: number; retryCount?: number; reason: string; metadata?: JsonObject }
  | { kind: "temporary_target_override"; targetNodeId: string; target: AutomationStudioRuntimeTargetOverrideTarget; reason: string; metadata?: JsonObject }
  | { kind: "temporary_recovery_subflow_call"; subflowId: string; reason: string; metadata?: JsonObject }
  | { kind: "temporary_reroute"; fromNodeId: string; toNodeId: string; reason: string; metadata?: JsonObject };

export function isAutomationStudioRuntimeTargetOverrideTarget(value: unknown): value is AutomationStudioRuntimeTargetOverrideTarget {
  if (!isRecord(value) || Object.keys(value).length !== 1) return false;
  return typeof value.selector === "string" && value.selector.trim().length > 0 && value.selector.length <= 1_000;
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
