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
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../../recovery/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop.ts";
import { automationStudioLoopStageInstructions, type AutomationStudioLoopStage } from "../stages/index.ts";
import { automationStudioLlmTokenBudgetBytes } from "../token-estimation.ts";
import { automationStudioEvidenceKey, sanitizeAutomationStudioLlmFailureEvidence } from "./failure-evidence.ts";
import { resolveAutomationStudioLlmInstructions, type AutomationStudioInstructionResolution } from "./instruction.ts";
import { isJsonObject } from "./json-bounds.ts";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind } from "./task-kind.ts";
import type { AutomationStudioLlmExploredEvidencePacket, AutomationStudioLlmHarnessInput } from "./task-request.ts";
import { resolveAutomationStudioLlmTokenLimits } from "./token-limits.ts";

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
  explorationEvidence?: {
    schemaVersion: "automation-studio.exploration-evidence.v1";
    packets: AutomationStudioLlmExploredEvidencePacket[];
    withheldPackets: number;
  };
  /** The standardized account of what went wrong: sections in a fixed priority
   * order, a byte budget, and a record of what was withheld and why. Runtime
   * tasks only, like `failureEvidence`. */
  recoveryContext?: AutomationStudioRuntimeRecoveryContext;
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
  // Packed last, because what it may take is what the rest of the request left.
  if (input.explorationEvidence === undefined) return packed;
  return {
    ...packed,
    explorationEvidence: packExploredEvidence(input, input.explorationEvidence, deniedEvidenceKeys, Buffer.byteLength(JSON.stringify(packed), "utf8"))
  };
}

/**
 * What a runtime patch request costs besides its context: the provider's system
 * prompt, the `runtime_patch` output schema and the request envelope. An empty
 * runtime patch request measured 3,774 bytes by the DeepSeek adapter's own
 * estimate on 2026-09-16; the rest is headroom for the explored-evidence
 * instruction and for growth. `harness.test.ts` sends the largest slot the room
 * admits through that estimate, so outgrowing this reserve fails the build
 * rather than a live patch call.
 */
const RUNTIME_PATCH_REQUEST_OVERHEAD_BYTES = 6_000;
/** Core's label for a packet: a handle token with no colon, so `<evidenceId>:<handle>` reads one way only. */
const EXPLORED_EVIDENCE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,30}[A-Za-z0-9])?$/u;
const EXPLORED_EVIDENCE_TOOL_ID = /^[a-z0-9_.:-]{1,200}$/iu;

/**
 * The explored packets a runtime patch may be shown, bounded twice.
 *
 * By count, at the loop's own ceiling on the evidence one exploration can
 * gather. By bytes, at the smaller of the caller's allowance and the room the
 * rest of the request left under its input-token limit -- so carrying the
 * exploration can never push a patch call that would have been sent over its
 * budget and get it refused. Newest first, because the newest page is the one
 * the repair runs against; a packet that does not fit, or that is not a
 * bounded packet free of the domain's denied keys, is withheld and counted.
 *
 * A caller defect -- the wrong task, no allowance, labels that are missing,
 * repeated or could be misread -- is refused outright.
 */
function packExploredEvidence(
  input: AutomationStudioLlmHarnessInput,
  exploration: NonNullable<AutomationStudioLlmHarnessInput["explorationEvidence"]>,
  deniedKeys: readonly string[],
  packedBytes: number
): NonNullable<AutomationStudioLlmContextPacket["explorationEvidence"]> {
  if (input.taskKind !== "runtime_patch") throw new Error("Exploration evidence is available only to runtime patch tasks.");
  if (!Number.isSafeInteger(exploration.maxBytes) || exploration.maxBytes < 1) throw new Error("Exploration evidence requires a positive byte allowance.");
  if (!Array.isArray(exploration.packets)) throw new Error("Exploration evidence requires a list of packets.");
  const labels = new Set<string>();
  for (const entry of exploration.packets) {
    const valid = entry && typeof entry.evidenceId === "string" && EXPLORED_EVIDENCE_ID.test(entry.evidenceId) && !labels.has(entry.evidenceId)
      && typeof entry.toolId === "string" && EXPLORED_EVIDENCE_TOOL_ID.test(entry.toolId);
    if (!valid) throw new Error("Exploration evidence packets require distinct bounded labels.");
    labels.add(entry.evidenceId);
  }
  const limits = resolveAutomationStudioLlmTokenLimits(input.tokenLimits).limits;
  const inputTokens = Math.min(limits.maxInputTokens, limits.maxTotalTokens - limits.maxOutputTokens);
  const allowance = Math.min(exploration.maxBytes, automationStudioLlmTokenBudgetBytes(inputTokens) - packedBytes - RUNTIME_PATCH_REQUEST_OVERHEAD_BYTES);
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const carried: AutomationStudioLlmExploredEvidencePacket[] = [];
  let withheldPackets = 0;
  for (let index = exploration.packets.length - 1; index >= 0; index -= 1) {
    const entry = exploration.packets[index]!;
    const candidate = carried.length < AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls && boundedExploredPacket(entry.packet, denied)
      ? { evidenceId: entry.evidenceId, toolId: entry.toolId, packet: JSON.parse(JSON.stringify(entry.packet)) as JsonObject }
      : undefined;
    // Measured as the slot is sent, with the key in front of it and the largest withheld count it could carry.
    if (candidate && Buffer.byteLength(JSON.stringify({ explorationEvidence: exploredEvidenceSlot([candidate, ...carried], exploration.packets.length) }), "utf8") <= allowance) carried.unshift(candidate);
    else withheldPackets += 1;
  }
  return exploredEvidenceSlot(carried, withheldPackets);
}

function exploredEvidenceSlot(packets: AutomationStudioLlmExploredEvidencePacket[], withheldPackets: number): NonNullable<AutomationStudioLlmContextPacket["explorationEvidence"]> {
  return { schemaVersion: "automation-studio.exploration-evidence.v1", packets, withheldPackets };
}

/**
 * Whether a value is a packet Core will carry: bounded JSON with a schema
 * version, no string longer than a failure packet may hold, and none of the
 * domain's denied keys at any depth. The byte bound is the slot's, above,
 * because an explored page is allowed to be larger than a failure snapshot.
 */
function boundedExploredPacket(packet: unknown, deniedKeys: ReadonlySet<string>): packet is JsonObject {
  if (!isJsonObject(packet) || typeof packet.schemaVersion !== "string" || !/^[a-z0-9_.:-]{1,100}$/iu.test(packet.schemaVersion)) return false;
  const pending: unknown[] = [packet];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") { if (value.length > 2_000) return false; continue; }
    if (!value || typeof value !== "object") continue;
    const children = Array.isArray(value) ? value.map((item) => ["", item] as const) : Object.entries(value);
    for (const [key, child] of children) {
      if (key.length > 100 || deniedKeys.has(automationStudioEvidenceKey(key))) return false;
      pending.push(child);
    }
  }
  return true;
}

/**
 * The domain's declaration, or a refusal.
 *
 * Evidence and reusable context are the two places a domain's raw payload can
 * reach the model, and Core cannot name the keys that carry it for a medium it
 * knows nothing about. An absent declaration therefore does not mean "deny
 * nothing"; it means nobody said, and the packet would carry whatever the
 * domain happened to capture. So the packet is refused instead of built.
 *
 * `AutomationStudioLlmEvidenceRuntimeBinding.deniedEvidenceKeys` is required,
 * so a bound domain cannot arrive here by omission. This closes the same hole
 * for a caller that assembles a harness input by hand. A domain with nothing
 * to deny declares `[]`, which arrives as an empty list and passes: a claim a
 * reviewer can see, where an absent field is not.
 */
function declaredDeniedEvidenceKeys(input: AutomationStudioLlmHarnessInput): readonly string[] {
  if (input.deniedEvidenceKeys !== undefined) return input.deniedEvidenceKeys;
  if (input.failureEvidence !== undefined || input.explorationEvidence !== undefined || input.reusableContext !== undefined) {
    throw new Error("Automation Studio LLM context carrying failure evidence, exploration evidence or reusable context requires the domain's declared deniedEvidenceKeys; declare [] to deny nothing.");
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
