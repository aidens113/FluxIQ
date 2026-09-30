// Decisions for the history tests, in the shapes the evidence loop will record,
// with signatures computed the way the loop will compute them.

import type { JsonObject } from "../../../../../../core/index.ts";
import {
  AutomationStudioLlmDecisionContextRecorder,
  automationStudioLlmDecisionContextSignature,
  type AutomationStudioLlmDecisionContextDecision
} from "../index.ts";

export const RUN_NODE = "core.run_node";

export function callSignature(input: JsonObject, toolId = RUN_NODE): string {
  return automationStudioLlmDecisionContextSignature({ kind: "tool_call", toolId, input });
}

export function completionSignature(result: JsonObject): string {
  return automationStudioLlmDecisionContextSignature({ kind: "complete", result });
}

/** An executed node call. */
export function call(callId: string, actionId: string, extra: { changed?: "yes" | "no" | "unknown"; resultCode?: string; refused?: boolean; input?: JsonObject } = {}): AutomationStudioLlmDecisionContextDecision {
  return {
    kind: "call",
    signature: callSignature(extra.input ?? { actionId }),
    callId,
    toolId: RUN_NODE,
    actionId,
    resultCode: extra.resultCode ?? (extra.refused ? "web.action.rejected.not_found" : "web.action.succeeded"),
    changed: extra.changed ?? "yes",
    ...(extra.refused ? { refused: true } : {})
  };
}

/** A request answered from memory by `answeredByCallId`, repeating the call that asked `{ actionId }`. */
export function answered(actionId: string, answeredByCallId: string): AutomationStudioLlmDecisionContextDecision {
  return { kind: "answered", signature: callSignature({ actionId }), toolId: RUN_NODE, actionId, code: "llm_evidence_loop.already_answered", answeredByCallId };
}

/** A completion refused by the check. */
export function refusedCompletion(result: JsonObject, issueCodes: string[], draftRevision = 1, feedback?: unknown): AutomationStudioLlmDecisionContextDecision {
  return {
    kind: "completion",
    signature: completionSignature(result),
    draftRevision,
    accepted: false,
    issueCodes,
    ...(feedback === undefined ? {} : { feedback }),
    dryRun: "not_run"
  };
}

/** A recorder holding `decisions`, each at the iteration beside it. */
export function recorded(decisions: ReadonlyArray<[number, AutomationStudioLlmDecisionContextDecision]>): AutomationStudioLlmDecisionContextRecorder {
  const recorder = new AutomationStudioLlmDecisionContextRecorder();
  for (const [iteration, decision] of decisions) recorder.record(iteration, decision);
  return recorder;
}

export function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
