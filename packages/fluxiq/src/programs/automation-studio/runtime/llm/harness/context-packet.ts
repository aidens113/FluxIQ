import { parseAutomationStudioFailureRecord, type AutomationStudioAdaptiveFailureClass } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowRunActionAttemptRecord,
  AutomationStudioFlowSubflow
} from "../../../model/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS,
  automationStudioFlowBootstrapCatalogByteBudget,
  buildAutomationStudioFlowBootstrapContext
} from "../../flow-bootstrap/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop.ts";
import { automationStudioLoopStageInstructions, type AutomationStudioLoopStage } from "../stages/index.ts";
import { automationStudioEvidenceKey, sanitizeAutomationStudioLlmFailureEvidence } from "./failure-evidence.ts";
import { resolveAutomationStudioLlmInstructions, type AutomationStudioInstructionResolution } from "./instruction.ts";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind } from "./task-kind.ts";
import type { AutomationStudioLlmHarnessInput } from "./task-request.ts";

export type AutomationStudioLlmContextPacket = {
  schemaVersion: "0.1";
  taskKind: AutomationStudioLlmTaskKind;
  /** Where this call sits in the loop's fixed order of work, when it is part of
   * one. Absent for a call made outside the protocol. */
  stage?: AutomationStudioLoopStage;
  promptVersion: string;
  projectId: string;
  flowId: string;
  runId?: string;
  subflowId?: string;
  nodeId?: string;
  instructions: AutomationStudioInstructionResolution;
  stateDiffs?: JsonValue[];
  routeHistory?: JsonValue[];
  recentActions?: AutomationStudioLlmRecentActionContext[];
  failureEvidence?: JsonObject;
  relevantRuns?: JsonObject[];
  relevantAdaptations?: JsonObject[];
  reusableContext?: AutomationStudioReusableLlmContextPacket;
  subflows?: Array<Pick<AutomationStudioFlowSubflow, "subflowId" | "name" | "role" | "status" | "routeTags" | "stability">>;
  availableActions?: JsonObject[];
  flowBootstrap?: ReturnType<typeof buildAutomationStudioFlowBootstrapContext>;
  evidenceLoop?: {
    iteration: number;
    tools: AutomationStudioLlmEvidenceTool[];
    evidence: Array<{ callId: string; toolId: string; value: JsonValue }>;
    decisionSchema: JsonObject;
    completionSchema: JsonObject;
    canComplete: boolean;
  };
  policyGates?: JsonObject;
  metadata?: JsonObject;
};

export const AUTOMATION_STUDIO_LLM_MAX_RECENT_ACTIONS = 12;

export type AutomationStudioLlmRecentActionContext = Pick<AutomationStudioFlowRunActionAttemptRecord,
  "attemptId" | "nodeId" | "definitionId" | "order" | "status"
> & {
  route?: string;
  durationMs?: number;
  comparisonStatus?: string;
  /** Core's category from the attempt's failure record, when the record parses. Its code and texts are not sent. */
  failureCategory?: AutomationStudioAdaptiveFailureClass;
};

export function packAutomationStudioLlmContext(input: AutomationStudioLlmHarnessInput): AutomationStudioLlmContextPacket {
  const stage = input.stage;
  // The prompt is versioned by stage as well as by task kind: the same kind
  // asked at "implement" and at "iterate" is a different prompt, and a recorded
  // intervention has to say which one it was.
  const promptVersion = stage ? `${AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS[input.taskKind]}+stage.${stage}` : AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS[input.taskKind];
  // Composed here rather than accepted from the caller, so a staged request
  // always carries Core's ordering statement. There is no argument by which a
  // caller, or a domain that replaced every stage, can omit it.
  const instructions = resolveAutomationStudioLlmInstructions(
    input,
    stage ? automationStudioLoopStageInstructions(stage, input.stageInstructions) : []
  );
  const deniedEvidenceKeys = input.deniedEvidenceKeys ?? [];
  const flowBootstrap = (input.taskKind === "flow_bootstrap" || input.taskKind === "evidence_tool_decision") && input.flowBootstrap
    ? buildAutomationStudioFlowBootstrapContext({
      ...(input.flowBootstrap.registry ? { registry: input.flowBootstrap.registry } : {}),
      resolution: input.flowBootstrap.resolution,
      instructionText: instructions.instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n"),
      maxCatalogBytes: automationStudioFlowBootstrapCatalogByteBudget({
        maxInputTokens: input.flowBootstrap.maxInputTokens ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens,
        instructionBytes: Buffer.byteLength(JSON.stringify(instructions), "utf8")
      })
    })
    : undefined;
  return {
    schemaVersion: "0.1",
    taskKind: input.taskKind,
    ...(stage ? { stage } : {}),
    promptVersion,
    projectId: input.projectId,
    flowId: input.flowId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    instructions,
    ...(input.stateDiffs?.length ? { stateDiffs: input.stateDiffs.slice(0, 50) } : {}),
    ...(input.routeHistory?.length ? { routeHistory: input.routeHistory.slice(-25) } : {}),
    ...(input.runDetail?.actionAttempts?.length ? { recentActions: input.runDetail.actionAttempts.slice(-AUTOMATION_STUDIO_LLM_MAX_RECENT_ACTIONS).map(compactRecentActionForLlm) } : {}),
    ...(input.failureEvidence ? { failureEvidence: sanitizeAutomationStudioLlmFailureEvidence(input.taskKind, input.failureEvidence, deniedEvidenceKeys) } : {}),
    ...(input.relevantRuns?.length ? { relevantRuns: input.relevantRuns.slice(0, 25) } : {}),
    ...(input.relevantAdaptations?.length ? { relevantAdaptations: input.relevantAdaptations.slice(0, 25) } : {}),
    ...(input.reusableContext ? { reusableContext: sanitizeReusableLlmContextPacket(input.reusableContext, deniedEvidenceKeys) } : {}),
    ...(input.subflows?.length ? { subflows: input.subflows.slice(0, 100).map(compactSubflowForLlm) } : {}),
    ...(input.availableActions?.length ? { availableActions: input.availableActions.slice(0, 100) } : {}),
    ...(flowBootstrap ? { flowBootstrap } : {}),
    ...(input.taskKind === "evidence_tool_decision" && input.evidenceLoop ? { evidenceLoop: structuredClone(input.evidenceLoop) } : {}),
    ...(input.policy ? { policyGates: adaptationPolicyGates(input.policy) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}

function sanitizeReusableLlmContextPacket(packet: AutomationStudioReusableLlmContextPacket, deniedKeys: readonly string[]): AutomationStudioReusableLlmContextPacket {
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  if (packet.schemaVersion !== "automation-studio.reusable-llm-context-packet.v1" || !Array.isArray(packet.items) || packet.items.length > 5) throw new Error("Reusable LLM context packet is invalid.");
  const ids = new Set<string>();
  const items = packet.items.map((item) => {
    const allowed = ["advisory", "recordId", "contentDigest", "outcome", "reviewerState", "validationState", "sourceRunIds", "sourceAdaptationIds", "promptProjection"];
    if (!item || typeof item !== "object" || Object.keys(item).some((key) => !allowed.includes(key)) || item.advisory !== true
      || !/^[A-Za-z0-9._:-]{1,200}$/u.test(item.recordId) || ids.has(item.recordId) || !/^[a-f0-9]{64}$/u.test(item.contentDigest)
      || !["succeeded", "failed", "unknown"].includes(item.outcome) || !["unreviewed", "approved"].includes(item.reviewerState)
      || !["unknown", "validated", "applied"].includes(item.validationState)
      || !safeReusableSourceIds(item.sourceRunIds) || !safeReusableSourceIds(item.sourceAdaptationIds)
      || containsReusableExecutableTarget(item.promptProjection, denied)) throw new Error("Reusable LLM context packet is invalid.");
    ids.add(item.recordId);
    return structuredClone(item);
  });
  const clean: AutomationStudioReusableLlmContextPacket = { schemaVersion: packet.schemaVersion, items };
  if (Buffer.byteLength(JSON.stringify(clean), "utf8") > 8_192) throw new Error("Reusable LLM context packet exceeds its byte limit.");
  return clean;
}

function safeReusableSourceIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 25 && value.every((item) => typeof item === "string" && /^[A-Za-z0-9._:-]{1,200}$/u.test(item));
}

/**
 * Historical context may describe what was done; it may never carry something
 * the model could execute or address directly.
 *
 * Core denies its own vocabulary for that -- the `target` family, which is what
 * a repair addresses in every domain. `selector` and `selectors` used to be in
 * this list too. They are a browser's word for a target and had no business in
 * a framework with no page in it, so they moved to the web domain's declared
 * keys, which arrive as `deniedKeys` and are checked here beside Core's own.
 */
function containsReusableExecutableTarget(value: JsonValue, deniedKeys: ReadonlySet<string>, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsReusableExecutableTarget(item, deniedKeys, seen));
  return Object.entries(value).some(([key, item]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
    return /^(?:target|targets|targetid|targetids|targetnodeid|targetnodeids|actiontarget|actiontargets)$/u.test(normalized)
      || deniedKeys.has(normalized)
      || containsReusableExecutableTarget(item as JsonValue, deniedKeys, seen);
  });
}

function compactRecentActionForLlm(action: AutomationStudioFlowRunActionAttemptRecord): AutomationStudioLlmRecentActionContext {
  // Stored records are parsed again; only Core's category name reaches the model.
  const failureCategory = parseAutomationStudioFailureRecord(action.failure)?.category;
  return {
    attemptId: action.attemptId,
    nodeId: action.nodeId,
    definitionId: action.definitionId,
    order: action.order,
    status: action.status,
    ...(action.route ? { route: action.route } : {}),
    ...(Number.isSafeInteger(action.durationMs) && action.durationMs! >= 0 && action.durationMs! <= 86_400_000 ? { durationMs: action.durationMs } : {}),
    ...(action.comparisonStatus ? { comparisonStatus: action.comparisonStatus } : {}),
    ...(failureCategory ? { failureCategory } : {})
  };
}

function compactSubflowForLlm(subflow: AutomationStudioFlowSubflow): NonNullable<AutomationStudioLlmContextPacket["subflows"]>[number] {
  return {
    subflowId: subflow.subflowId,
    name: subflow.name,
    role: subflow.role,
    status: subflow.status,
    ...(subflow.routeTags?.length ? { routeTags: subflow.routeTags } : {}),
    ...(subflow.stability ? { stability: subflow.stability } : {})
  };
}

function adaptationPolicyGates(policy: AutomationStudioAdaptationPolicy): JsonObject {
  return {
    preset: policy.preset,
    allowRuntimeRecovery: policy.allowRuntimeRecovery,
    allowCreateRecoveryPaths: policy.allowCreateRecoveryPaths,
    allowModifySubflows: policy.allowModifySubflows,
    allowCreateSubflows: policy.allowCreateSubflows,
    allowModifyRouter: policy.allowModifyRouter,
    allowModifyExpectations: policy.allowModifyExpectations,
    allowModifyActionTargets: policy.allowModifyActionTargets,
    allowDeleteOrDisableBehavior: policy.allowDeleteOrDisableBehavior,
    allowExternalSideEffects: policy.allowExternalSideEffects,
    requireApprovalForDestructiveChanges: policy.requireApprovalForDestructiveChanges,
    requireApprovalForExternalSideEffects: policy.requireApprovalForExternalSideEffects,
    ...(policy.maxInterventionsPerRun !== undefined ? { maxInterventionsPerRun: policy.maxInterventionsPerRun } : {}),
    ...(policy.maxEstimatedCostUsdPerRun !== undefined ? { maxEstimatedCostUsdPerRun: policy.maxEstimatedCostUsdPerRun } : {})
  };
}
