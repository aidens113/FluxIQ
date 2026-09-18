import {
  isAutomationStudioAdaptiveFailureClass,
  parseAutomationStudioFailureRecord,
  type AutomationStudioAdaptiveFailureClass
} from "@fluxiq/contracts/automation-studio";
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
import type { AutomationStudioRuntimeRecoveryContext } from "../../recovery/index.ts";
import type { AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop.ts";
import { automationStudioLoopStageInstructions, type AutomationStudioLoopStage } from "../stages/index.ts";
import { screenAutomationStudioLlmEvidence } from "./evidence-screen.ts";
import { packAutomationStudioLlmExploredEvidence, type AutomationStudioLlmExploredEvidenceSlot } from "./explored-evidence.ts";
import { automationStudioEvidenceKey, sanitizeAutomationStudioLlmFailureEvidence } from "./failure-evidence.ts";
import { resolveAutomationStudioLlmInstructions, type AutomationStudioInstructionResolution } from "./instruction.ts";
import { AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH, type AutomationStudioLlmDiagnosisFields } from "./structured-response.ts";
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
  /** The pages a recovery's exploration returned, carried to a runtime patch so
   * a control only the exploration revealed can be named in the repair. The
   * newest packets that fit, oldest first; the rest are counted and never
   * sent. A target check reads this list and no other. Runtime patch only. */
  explorationEvidence?: AutomationStudioLlmExploredEvidenceSlot;
  /** The standardized account of what went wrong: sections in a fixed priority
   * order, a byte budget, and a record of what was withheld and why. Runtime
   * tasks only, like `failureEvidence`. */
  recoveryContext?: AutomationStudioRuntimeRecoveryContext;
  /** The diagnosis the model produced one call earlier, so the stage that is
   * told to carry out the plan it just stated is shown that plan. Runtime
   * patch only. */
  diagnosis?: AutomationStudioLlmDiagnosisFields;
  /** The bounded account of what a finished run produced, and of the shape of
   * the Flow that produced it. Result verification only: it is the whole
   * subject of that call, and no other task has a finished result to read. */
  resultSummary?: AutomationStudioRunResultSummary;
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

/**
 * Every field a recent action may carry. The `satisfies` clause is the point:
 * a field added to the type above and left out here, or listed here and not in
 * the type, fails the type check. The provider used to keep its own copy of
 * this list, and when `failureCategory` was added to the projection that copy
 * was not updated, so every recovery from a failure with a structured record
 * was refused before it was sent.
 */
const RECENT_ACTION_FIELDS = {
  attemptId: true,
  nodeId: true,
  definitionId: true,
  order: true,
  status: true,
  route: true,
  durationMs: true,
  comparisonStatus: true,
  failureCategory: true
} as const satisfies Record<keyof AutomationStudioLlmRecentActionContext, true>;
const RECENT_ACTION_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(RECENT_ACTION_FIELDS));

/**
 * Whether a value is a recent action exactly as `packAutomationStudioLlmContext`
 * projects one: only the fields above, each bounded. A provider checks what it
 * is about to send with this, rather than with a list of its own.
 */
export function isAutomationStudioLlmRecentActionContext(value: unknown): value is AutomationStudioLlmRecentActionContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  if (Object.keys(action).some((key) => !RECENT_ACTION_FIELD_NAMES.has(key))) return false;
  if (typeof action.attemptId !== "string" || typeof action.nodeId !== "string" || typeof action.definitionId !== "string"
    || !Number.isSafeInteger(action.order) || typeof action.status !== "string") return false;
  if ([action.attemptId, action.nodeId, action.definitionId, action.status, action.route, action.comparisonStatus]
    .some((text) => text !== undefined && (typeof text !== "string" || text.length < 1 || text.length > 200))) return false;
  if (action.failureCategory !== undefined && !isAutomationStudioAdaptiveFailureClass(action.failureCategory)) return false;
  return action.durationMs === undefined
    || (Number.isSafeInteger(action.durationMs) && (action.durationMs as number) >= 0 && (action.durationMs as number) <= 86_400_000);
}

export function packAutomationStudioLlmContext(input: AutomationStudioLlmHarnessInput): AutomationStudioLlmContextPacket {
  const stage = input.stage;
  // The prompt is versioned by stage as well as by task kind: the same kind
  // asked at "implement" and at "iterate" is a different prompt, and a recorded
  // intervention has to say which one it was.
  const promptVersion = stage ? `${AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS[input.taskKind]}+stage.${stage}` : AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS[input.taskKind];
  // Composed here rather than accepted from the caller, so a staged request
  // always carries Core's ordering statement. There is no argument by which a
  // caller, or a domain that replaced every stage, can omit it.
  //
  // Whether the request carries tools is read off the packet this call is
  // building, not asserted by the caller, so the tool policy is attached to a
  // request that really has tools rather than to every call that happens to be
  // gathering. A runtime diagnosis gathers with nothing to call.
  const toolsOffered = input.taskKind === "evidence_tool_decision" && (input.evidenceLoop?.tools.length ?? 0) > 0;
  const instructions = resolveAutomationStudioLlmInstructions(
    input,
    stage ? automationStudioLoopStageInstructions(stage, input.stageInstructions, { toolsOffered }) : []
  );
  const deniedEvidenceKeys = declaredDeniedEvidenceKeys(input);
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
  const packed: AutomationStudioLlmContextPacket = {
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
    // Held to the same task-kind rule as the failure evidence it sits beside: a
    // flow-bootstrap packet describes a Flow that has never run, so a record of
    // how a run failed has no place in it.
    ...(input.recoveryContext && (input.taskKind === "runtime_diagnosis" || input.taskKind === "runtime_patch") ? { recoveryContext: input.recoveryContext } : {}),
    ...(input.diagnosis ? packDiagnosisFields(input.taskKind, input.diagnosis) : {}),
    // Held to its own task kind for the same reason failure evidence is: a
    // result summary describes a run that finished, and no other call is
    // looking at one.
    ...(input.resultSummary && input.taskKind === "loop_verification" ? { resultSummary: input.resultSummary } : {}),
    ...(input.relevantRuns?.length ? { relevantRuns: input.relevantRuns.slice(0, 25) } : {}),
    ...(input.relevantAdaptations?.length ? { relevantAdaptations: input.relevantAdaptations.slice(0, 25) } : {}),
    ...(input.reusableContext ? { reusableContext: sanitizeReusableLlmContextPacket(input.reusableContext, deniedEvidenceKeys) } : {}),
    ...(input.subflows?.length ? { subflows: input.subflows.slice(0, 100).map(compactSubflowForLlm) } : {}),
    ...(input.availableActions?.length ? { availableActions: input.availableActions.slice(0, 100) } : {}),
    ...(flowBootstrap ? { flowBootstrap } : {}),
    ...(input.taskKind === "evidence_tool_decision" && input.evidenceLoop ? { evidenceLoop: packEvidenceLoop(input.evidenceLoop, deniedEvidenceKeys) } : {}),
    ...(input.policy ? { policyGates: adaptationPolicyGates(input.policy) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
  // Packed last, because what it may take is what the rest of the request left.
  if (input.explorationEvidence === undefined) return packed;
  return {
    ...packed,
    explorationEvidence: packAutomationStudioLlmExploredEvidence(input, input.explorationEvidence, deniedEvidenceKeys, Buffer.byteLength(JSON.stringify(packed), "utf8"))
  };
}

/**
 * The diagnosis the model produced, as the patch request carries it.
 *
 * Written field by field, never spread. The diagnosis channel is a fixed set of
 * keys for the same reason the response reader has one -- an open object is a
 * way to put arbitrary JSON in front of the next call -- and this is the same
 * list on the way back out. An unrecognized key is dropped, each text is cut to
 * the bound the reader holds it to, each verdict must be one of its three
 * words, and each flag must be a boolean.
 *
 * An empty result is no slot at all: a diagnosis that answered nothing would
 * otherwise cost bytes to say so, and the request already says the diagnosis
 * ran. The slot is a runtime patch's; a diagnosis would be shown its own
 * answer, and no other task has one to be shown, so any other task carrying it
 * is refused rather than quietly dropped.
 */
function packDiagnosisFields(
  taskKind: AutomationStudioLlmTaskKind,
  diagnosis: AutomationStudioLlmDiagnosisFields
): { diagnosis?: AutomationStudioLlmDiagnosisFields } {
  if (taskKind !== "runtime_patch") throw new Error("The model's diagnosis is carried only to a runtime patch request.");
  const verdict = (value: unknown): "yes" | "no" | "unknown" | undefined =>
    value === "yes" || value === "no" || value === "unknown" ? value : undefined;
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.slice(0, AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH) : undefined;
  const flag = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);
  const packed: AutomationStudioLlmDiagnosisFields = {
    ...(text(diagnosis.expected) !== undefined ? { expected: text(diagnosis.expected)! } : {}),
    ...(text(diagnosis.observed) !== undefined ? { observed: text(diagnosis.observed)! } : {}),
    ...(text(diagnosis.changed) !== undefined ? { changed: text(diagnosis.changed)! } : {}),
    ...(verdict(diagnosis.stillAchievable) ? { stillAchievable: verdict(diagnosis.stillAchievable)! } : {}),
    ...(verdict(diagnosis.deterministicRecoveryPossible) ? { deterministicRecoveryPossible: verdict(diagnosis.deterministicRecoveryPossible)! } : {}),
    ...(flag(diagnosis.explorationNeeded) !== undefined ? { explorationNeeded: flag(diagnosis.explorationNeeded)! } : {}),
    ...(flag(diagnosis.patchNeeded) !== undefined ? { patchNeeded: flag(diagnosis.patchNeeded)! } : {})
  };
  return Object.keys(packed).length ? { diagnosis: packed } : {};
}

/**
 * The loop's context, carrying nothing the bound domain denies.
 *
 * During a recovery's exploration, `evidence` is whatever the domain's options
 * returned, and it was copied into the request as it stood: the one place a
 * domain's page reached the model without its declared keys applied. It is
 * held to them now, and in the way failure evidence is -- refused, not trimmed.
 * A request carrying a denied key is not built, so no provider is called; the
 * loop that asked ends on the refusal, which is what a failure capture carrying
 * one does too. The refusal names no key and repeats no value.
 */
function packEvidenceLoop(
  loop: NonNullable<AutomationStudioLlmHarnessInput["evidenceLoop"]>,
  deniedKeys: readonly string[]
): NonNullable<AutomationStudioLlmContextPacket["evidenceLoop"]> {
  if (loop.evidence.some((item) => screenAutomationStudioLlmEvidence(item.value, deniedKeys).deniedKey)) {
    throw new Error("Evidence-loop evidence carries a key the bound domain denies, so the decision request is refused rather than sent.");
  }
  return structuredClone(loop);
}

/**
 * The domain's declaration, or a refusal.
 *
 * Evidence -- a failure capture, explored pages, an evidence loop's gathered
 * results -- and reusable context are where a domain's raw payload can reach
 * the model, and Core cannot name the keys that carry it for a medium it knows
 * nothing about. An absent declaration therefore does not mean "deny nothing";
 * it means nobody said, and the packet would carry whatever the domain
 * happened to capture. So the packet is refused instead of built.
 *
 * `AutomationStudioLlmEvidenceRuntimeBinding.deniedEvidenceKeys` is required,
 * so a bound domain cannot arrive here by omission. This closes the same hole
 * for a caller that assembles a harness input by hand. A domain with nothing
 * to deny declares `[]`, which arrives as an empty list and passes: a claim a
 * reviewer can see, where an absent field is not. The empty list returned
 * last is for a request that carries nothing to check, and never reaches the
 * request: a provider's own check reads the declaration, not this.
 */
function declaredDeniedEvidenceKeys(input: AutomationStudioLlmHarnessInput): readonly string[] {
  if (input.deniedEvidenceKeys !== undefined) return input.deniedEvidenceKeys;
  const gathered = input.taskKind === "evidence_tool_decision" && (input.evidenceLoop?.evidence.length ?? 0) > 0;
  if (input.failureEvidence !== undefined || input.explorationEvidence !== undefined || input.reusableContext !== undefined || gathered) {
    throw new Error("Automation Studio LLM context carrying failure evidence, exploration evidence, gathered evidence-loop evidence or reusable context requires the domain's declared deniedEvidenceKeys; declare [] to deny nothing.");
  }
  return [];
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
