import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioLlmEvidenceLoopAccounting,
  AutomationStudioLlmEvidenceLoopFailureCode,
  AutomationStudioLlmEvidenceLoopTrace,
  AutomationStudioLlmEvidenceTool,
  AutomationStudioLlmEvidenceToolExecutionResult
} from "../evidence-loop.ts";
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";
import type { AutomationStudioLlmEvidenceBatchDecision } from "./decision.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_RESULT_TOOL_ID,
  automationStudioLlmEvidenceBatchResultPacket,
  type AutomationStudioLlmEvidenceBatchActionReceipt
} from "./packet.ts";
import { automationStudioLlmEvidenceBatchStopReason, type AutomationStudioLlmEvidenceBatchStopReason } from "./stop.ts";

export type AutomationStudioLlmEvidenceAction = {
  callId: string;
  toolId: string;
  value: JsonValue;
  effectApplied: boolean;
  refused?: boolean;
  targetsUnchanged?: boolean;
  resultCode?: string;
  stopReason?: AutomationStudioLlmEvidenceBatchStopReason;
};

type ActionDecision = {
  kind: "tool_call";
  callId: string;
  toolId: string;
  input: JsonObject;
  usage?: AutomationStudioLlmUsageSummary;
};

type ActionTransitionResult =
  | { ok: true; action: AutomationStudioLlmEvidenceAction; mutationEpoch: number }
  | { ok: false; code: AutomationStudioLlmEvidenceLoopFailureCode };

/** The state-changing action transition shared by singleton and list decisions. */
export async function runAutomationStudioLlmEvidenceAction(input: {
  iteration: number;
  decision: ActionDecision;
  callId: string;
  maxEvidenceBytes: number;
  maxTotalEvidenceBytes: number;
  publishEvidence: boolean;
  batch?: { position: number; size: number };
  tool: AutomationStudioLlmEvidenceTool;
  mutationEpoch: number;
  requiresMutationBeforeRepeat: boolean;
  callIds: Set<string>;
  answeredRequests: Map<string, string>;
  observationEpochs: Map<string, number>;
  latestObservations: Map<string, string>;
  evidence: Array<{ callId: string; toolId: string; value: JsonValue }>;
  trace: AutomationStudioLlmEvidenceLoopTrace[];
  accounting: AutomationStudioLlmEvidenceLoopAccounting;
  requestSignature(epoch: number, toolId: string, value: JsonObject): string;
  parseExecution(value: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): {
    evidence: JsonValue;
    effectApplied: boolean;
    refused?: boolean;
    targetsUnchanged?: boolean;
    resultCode?: string;
  } | undefined;
  executeTool(value: { callId: string; toolId: string; value: JsonObject; maxEvidenceBytes: number; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  progressed(): void;
  signal?: AbortSignal;
}): Promise<ActionTransitionResult> {
  input.callIds.add(input.callId);
  input.answeredRequests.set(input.requestSignature(input.mutationEpoch, input.decision.toolId, input.decision.input), input.callId);
  let rawExecution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;
  try {
    rawExecution = await input.executeTool({
      callId: input.callId,
      toolId: input.decision.toolId,
      value: input.decision.input,
      maxEvidenceBytes: input.maxEvidenceBytes,
      ...(input.signal ? { signal: input.signal } : {})
    });
  } catch {
    return { ok: false, code: input.signal?.aborted ? "llm_evidence_loop.cancelled" : "llm_evidence_loop.tool_failed" };
  }
  const execution = input.parseExecution(rawExecution);
  if (!execution) return { ok: false, code: "llm_evidence_loop.tool_failed" };
  const { evidence: value, effectApplied, refused, targetsUnchanged, resultCode } = execution;
  const evidenceBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if ((input.batch && evidenceBytes > input.maxEvidenceBytes)
    || input.accounting.evidenceBytes + evidenceBytes > input.maxTotalEvidenceBytes) {
    return { ok: false, code: "llm_evidence_loop.evidence_limit" };
  }
  input.accounting.toolCalls += 1;
  input.accounting.evidenceBytes += evidenceBytes;
  input.progressed();
  const mutationEpoch = input.tool.effect === "mutate" && effectApplied ? input.mutationEpoch + 1 : input.mutationEpoch;
  if (input.requiresMutationBeforeRepeat) {
    input.observationEpochs.set(input.tool.toolId, mutationEpoch);
    input.latestObservations.set(input.tool.toolId, input.callId);
  }
  if (input.publishEvidence) input.evidence.push({ callId: input.callId, toolId: input.decision.toolId, value });
  const stopReason = input.batch
    ? automationStudioLlmEvidenceBatchStopReason({ evidence: value, effect: input.tool.effect, effectApplied, ...(refused === undefined ? {} : { refused }), ...(targetsUnchanged === undefined ? {} : { targetsUnchanged }) })
    : undefined;
  input.trace.push({
    iteration: input.iteration,
    decision: "tool_call",
    callId: input.callId,
    toolId: input.decision.toolId,
    evidenceBytes,
    ...(input.tool.effect === "mutate" ? { effectApplied } : {}),
    ...(resultCode ? { resultCode } : {}),
    ...(input.batch && targetsUnchanged !== undefined ? { targetsUnchanged } : {}),
    ...(input.batch ? { batch: { ...input.batch, ...(stopReason ? { stoppedBy: stopReason } : {}) } } : {}),
    ...(input.decision.usage ? { usage: input.decision.usage } : {})
  });
  return {
    ok: true,
    mutationEpoch,
    action: {
      callId: input.callId,
      toolId: input.decision.toolId,
      value,
      effectApplied,
      ...(refused === undefined ? {} : { refused }),
      ...(targetsUnchanged === undefined ? {} : { targetsUnchanged }),
      ...(resultCode ? { resultCode } : {}),
      ...(stopReason ? { stopReason } : {})
    }
  };
}

/** Read-only admission followed by ordered calls through the shared transition. */
export async function runAutomationStudioLlmEvidenceBatch(input: {
  decision: AutomationStudioLlmEvidenceBatchDecision & { usage?: AutomationStudioLlmUsageSummary };
  iteration: number;
  mutationEpoch: number;
  maxToolCalls: number;
  maxEvidenceBytes: number;
  maxEvidenceContextBytes: number;
  accounting: AutomationStudioLlmEvidenceLoopAccounting;
  answeredRequests: ReadonlyMap<string, string>;
  callIds: Set<string>;
  evidence: Array<{ callId: string; toolId: string; value: JsonValue }>;
  toolEffect(toolId: string): AutomationStudioLlmEvidenceTool["effect"];
  requestSignature(epoch: number, toolId: string, value: JsonObject): string;
  allocateCallId(requested: string): string;
  executeOne(decision: ActionDecision, callId: string, maxEvidenceBytes: number, batch: { position: number; size: number }): Promise<ActionTransitionResult>;
  reserveEvidence(value: JsonValue): number | undefined;
  preflightAdmission?(calls: readonly AutomationStudioLlmEvidenceBatchDecision["calls"][number][]): AutomationStudioLlmEvidenceLoopFailureCode | undefined;
}): Promise<{ ok: true } | { ok: false; code: AutomationStudioLlmEvidenceLoopFailureCode }> {
  if (input.accounting.toolCalls + input.decision.calls.length > input.maxToolCalls) {
    return { ok: false, code: "llm_evidence_loop.iteration_limit" };
  }
  const projectedRequests = new Set<string>();
  let projectedMutationEpoch = input.mutationEpoch;
  for (const call of input.decision.calls) {
    const signature = input.requestSignature(projectedMutationEpoch, call.toolId, call.input);
    if (input.answeredRequests.has(signature) || projectedRequests.has(signature)) {
      return { ok: false, code: "llm_evidence_loop.repeat_without_progress" };
    }
    projectedRequests.add(signature);
    if (input.toolEffect(call.toolId) === "mutate") projectedMutationEpoch += 1;
  }

  const packetOverhead = batchPacketEvidenceReserve(input.decision.calls.map((call) => call.toolId));
  const remainingEvidence = input.maxEvidenceBytes - input.accounting.evidenceBytes;
  const availablePerAction = Math.floor((remainingEvidence - packetOverhead) / (input.decision.calls.length + 1));
  const maxActionEvidenceBytes = Math.min(availablePerAction, input.maxEvidenceContextBytes - packetOverhead);
  if (maxActionEvidenceBytes < 1) return { ok: false, code: "llm_evidence_loop.evidence_limit" };
  const admissionFailure = input.preflightAdmission?.(input.decision.calls);
  if (admissionFailure) return { ok: false, code: admissionFailure };

  const receipts: AutomationStudioLlmEvidenceBatchActionReceipt[] = [];
  let latestEvidence: JsonValue = null;
  let stoppedBy: AutomationStudioLlmEvidenceBatchStopReason | undefined;
  for (const [index, call] of input.decision.calls.entries()) {
    const position = index + 1;
    const callId = input.allocateCallId(`batch.${input.iteration}.${position}`);
    const result = await input.executeOne({
      kind: "tool_call",
      callId,
      toolId: call.toolId,
      input: call.input,
      ...(position === 1 && input.decision.usage ? { usage: input.decision.usage } : {})
    }, callId, maxActionEvidenceBytes, { position, size: input.decision.calls.length });
    if (!result.ok) return result;
    const action = result.action;
    latestEvidence = action.value;
    receipts.push({
      position,
      callId: action.callId,
      toolId: action.toolId,
      effectApplied: action.effectApplied,
      ...(action.targetsUnchanged === undefined ? {} : { targetsUnchanged: action.targetsUnchanged }),
      ...(action.resultCode ? { resultCode: action.resultCode } : {})
    });
    if (action.stopReason) {
      stoppedBy = action.stopReason;
      break;
    }
  }
  const packet = automationStudioLlmEvidenceBatchResultPacket({ actions: receipts, latestEvidence, ...(stoppedBy ? { stoppedBy } : {}) });
  const packetBytes = input.reserveEvidence(packet);
  if (packetBytes === undefined || packetBytes > input.maxEvidenceContextBytes) {
    return { ok: false, code: "llm_evidence_loop.evidence_limit" };
  }
  const packetCallId = input.allocateCallId(`batch.${input.iteration}`);
  input.callIds.add(packetCallId);
  input.evidence.push({ callId: packetCallId, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_RESULT_TOOL_ID, value: packet });
  return { ok: true };
}

function batchPacketEvidenceReserve(toolIds: readonly string[]): number {
  const packet = automationStudioLlmEvidenceBatchResultPacket({
    actions: toolIds.map((toolId, index) => ({
      position: index + 1,
      callId: "x".repeat(200),
      toolId,
      effectApplied: false,
      targetsUnchanged: false,
      resultCode: "x".repeat(100)
    })),
    latestEvidence: null,
    stoppedBy: "targets_may_have_changed"
  });
  return Buffer.byteLength(JSON.stringify(packet), "utf8");
}
