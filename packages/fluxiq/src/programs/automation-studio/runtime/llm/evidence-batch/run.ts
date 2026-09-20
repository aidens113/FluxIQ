// Running a listed decision's actions, one after another, in one turn.
//
// Each action is run through the loop's own port exactly as a lone call is --
// the same repeat checks at the epoch as it now stands, the same tool-call
// ceiling, the same `executeTool`, the same accounting -- so a batch is not a
// second path with rules of its own, only the one path taken several times.
// What this adds is when to stop (./stop.ts) and the one packet that reports
// the turn (./packet.ts).
//
// A tool the loop does not offer anywhere in the list refuses the whole list
// before any of it runs, as it refuses a lone call. An action already answered
// is not run and is reported with the call that answers it. A turn in which
// nothing ran gives the loop nothing new; the loop counts it as the one step
// without progress a lone repeated request is.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioLlmEvidenceLoopTrace } from "../evidence-loop.ts";
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";
import { automationStudioLlmEvidenceBatchPlanned, type AutomationStudioLlmEvidenceBatchCall } from "./decision.ts";
import { automationStudioLlmEvidenceBatchPacket, automationStudioLlmEvidenceBatchReserve, type AutomationStudioLlmEvidenceBatchOutcome } from "./packet.ts";
import { automationStudioLlmEvidenceBatchStopAfter, type AutomationStudioLlmEvidenceBatchStop } from "./stop.ts";

/** One action that ran, as the loop's port reports it. */
export type AutomationStudioLlmEvidenceBatchRan = {
  callId: string;
  effect: "observe" | "mutate" | undefined;
  evidence: JsonValue;
  effectApplied: boolean;
  resultCode?: string;
  targetsUnchanged?: boolean;
};

/** What the loop does for one listed action. `Ended` is the loop's own result that ends it. */
export type AutomationStudioLlmEvidenceBatchPort<Ended> = {
  known(toolId: string): boolean;
  aborted(): boolean;
  atToolCallCeiling(): boolean;
  /** The earlier call that already answers this action at the epoch as it now stands, and how. */
  answered(call: AutomationStudioLlmEvidenceBatchCall): { code: string; callId: string } | undefined;
  /** Run one action as a lone call runs, claiming `requestedCallId` or an unused variant of it. */
  run(call: AutomationStudioLlmEvidenceBatchCall, requestedCallId: string, maxEvidenceBytes: number): Promise<{ ended: Ended } | AutomationStudioLlmEvidenceBatchRan>;
};

/** A batch turn: one trace step per action that ran (one step, with no call id, when none did), the packet, and the calls that answered repeats. */
export type AutomationStudioLlmEvidenceBatchTurn = {
  steps: AutomationStudioLlmEvidenceLoopTrace[];
  packet: JsonObject;
  answeredBy: string[];
};

export async function runAutomationStudioLlmEvidenceBatch<Ended>(input: {
  iteration: number;
  calls: readonly AutomationStudioLlmEvidenceBatchCall[];
  usage?: AutomationStudioLlmUsageSummary;
  /** What the one packet may occupy: what a lone result may, within the window and the budget left. */
  maxEvidenceBytes: number;
  port: AutomationStudioLlmEvidenceBatchPort<Ended>;
}): Promise<{ ended: Ended; steps: AutomationStudioLlmEvidenceLoopTrace[] } | { endedBy: AutomationStudioLlmEvidenceLoopFailureCode; steps: AutomationStudioLlmEvidenceLoopTrace[] } | AutomationStudioLlmEvidenceBatchTurn> {
  const { iteration, calls, usage, port } = input;
  if (calls.some((call) => !port.known(call.toolId))) return { endedBy: "llm_evidence_loop.unknown_tool", steps: [] };
  const { run } = automationStudioLlmEvidenceBatchPlanned(calls);
  const requested = run.map((call, index) => call.callId ?? `call.${iteration}.${index + 1}`);
  // Each action's own evidence is capped so that the latest one and every
  // outcome line fit in the packet together.
  const valueCap = Math.max(1, input.maxEvidenceBytes - automationStudioLlmEvidenceBatchReserve(run.map((call, index) => ({ toolId: call.toolId, callId: requested[index]! }))));
  const outcomes: AutomationStudioLlmEvidenceBatchOutcome[] = [];
  const steps: AutomationStudioLlmEvidenceLoopTrace[] = [];
  const ranAt: number[] = [];
  const answeredBy: string[] = [];
  let stop: { after: number; reason: AutomationStudioLlmEvidenceBatchStop } | undefined;
  for (const [index, call] of run.entries()) {
    if (stop) {
      outcomes.push({ toolId: call.toolId, status: "not_run" });
      continue;
    }
    if (port.aborted()) return { endedBy: "llm_evidence_loop.cancelled", steps };
    const answered = port.answered(call);
    if (answered) {
      answeredBy.push(answered.callId);
      outcomes.push({ toolId: call.toolId, status: "answered", code: answered.code, answeredByCallId: answered.callId });
      continue;
    }
    if (port.atToolCallCeiling()) {
      // As for a lone call: a ceiling reached before anything ran ends the loop.
      if (!steps.length) return { endedBy: "llm_evidence_loop.iteration_limit", steps };
      stop = { after: index, reason: "action_limit" };
      outcomes.push({ toolId: call.toolId, status: "not_run" });
      continue;
    }
    // PERMISSION SEAM (t018): the action reaches the caller's `executeTool` on
    // its own, so the run's permission check sees it alone. A needed permission
    // ends the run from inside `executeTool`, which comes back here as `ended`
    // and returns at once: the actions after it are never run, never skipped
    // past. See ./stop.ts for the contract this must keep if that changes.
    const ran = await port.run(call, requested[index]!, valueCap);
    if ("ended" in ran) return { ended: ran.ended, steps };
    outcomes.push({ toolId: call.toolId, status: "ran", callId: ran.callId, effect: ran.effect, evidence: ran.evidence, effectApplied: ran.effectApplied, ...(ran.resultCode ? { resultCode: ran.resultCode } : {}) });
    const stoppedBy = automationStudioLlmEvidenceBatchStopAfter({ effect: ran.effect, evidence: ran.evidence, effectApplied: ran.effectApplied, ...(ran.targetsUnchanged !== undefined ? { targetsUnchanged: ran.targetsUnchanged } : {}) });
    steps.push({
      iteration, decision: "tool_call", callId: ran.callId, toolId: call.toolId,
      ...(ran.effect === "mutate" ? { effectApplied: ran.effectApplied } : {}),
      ...(ran.resultCode ? { resultCode: ran.resultCode } : {}),
      // The decision's usage is one provider call's, so it is recorded once.
      ...(usage && !steps.length ? { usage } : {}),
      batch: { position: index + 1, size: calls.length }
    });
    ranAt.push(outcomes.length - 1);
    if (stoppedBy) stop = { after: index + 1, reason: stoppedBy };
  }
  for (const call of calls.slice(run.length)) outcomes.push({ toolId: call.toolId, status: "not_run" });
  if (!stop && run.length < calls.length) stop = { after: run.length, reason: "batch_limit" };
  const last = steps.at(-1);
  if (stop && last?.batch) last.batch.stoppedBy = stop.reason;
  if (!steps.length) {
    const first = outcomes.find((outcome) => outcome.status === "answered");
    steps.push({ iteration, decision: "tool_call", toolId: calls[0]!.toolId, ...(first?.status === "answered" ? { resultCode: first.code } : {}), ...(usage ? { usage } : {}) });
  }
  const packet = automationStudioLlmEvidenceBatchPacket({ outcomes, ...(stop ? { stop } : {}), maxBytes: input.maxEvidenceBytes });
  // A step whose value the model is shown is evidence, and says so the way a
  // lone call's step does, with its bytes: zero here, because the packet's
  // bytes are counted once, on the last step, by the loop. A repair carries
  // forward only packets from steps marked this way; a superseded value was
  // never shown and is not.
  const lines = packet.actions as JsonObject[];
  steps.forEach((step, index) => {
    const line = lines[ranAt[index]!];
    if (line && (line.value !== undefined || line.valueIn === "latest")) step.evidenceBytes = 0;
  });
  return { steps, packet, answeredBy };
}

