// Running part of the Flow again, from a chosen step, on the target as it stands.
//
// **Why it exists (t244).** The user's rule (2026-10-02): the build and repair
// loops can run the Flow from a chosen step to test part of it -- a repaired
// step and the ones after it -- without running everything. It never replaces
// the whole-Flow test: the dry run (`./replay-draft.ts`) is still what a
// completion must pass, and this touches none of its bookkeeping.
//
// **The same calls the dry run sends, and nothing else.** Each chosen step is
// sent through the loop's own executor, so the permission gate sees it as it
// sees every call, with the very argument the dry run would send
// (`./replay.ts`): a step whose effect lasts is checked, not repeated
// (`../../flow-draft/verify-only.ts`). What differs is what is left out: no
// reset first -- the target is where the model left it, which is the point --
// no second try on a step's own page, and no outcome written back to the draft
// (`step.replayed` is the dry run's, and a part run is never the Flow's test).
//
// **Where it stops.** A step the Flow does not always run that does not pass is
// reported and the run goes on, as the Flow would (`../../flow-draft/routing.ts`).
// Any other step that does not pass stops it there, and the target is left
// where it broke. A step with nothing to run it with -- one carried from an
// earlier Flow that never ran in this build (`./draft-from-flow.ts`) -- stops
// it too: it declares no consequence, and running it would pass a permission
// gate that reads an absent declaration as "no consequence".
//
// **Nothing here is counted as a tool call**, as the dry run's calls are not:
// the model asked for one call, and the loop counts that one.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftConditionalStepIds,
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStepIsProposed,
  automationStudioFlowDraftStepReplayMode,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { automationStudioNodeReplayStatus, automationStudioNodeReplayStepCall, automationStudioNodeReplayToolId, automationStudioNodeReplayVerifyCall } from "./replay.ts";

/** What a part run needs: the draft, the model's argument, its call id and the loop's executor. */
export type AutomationStudioFlowDraftPartRunInput = {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** The model's `{from, to?}`, unread until checked here. */
  value: JsonObject;
  /** The model's call; each step is sent as `<callId>.<position>`. */
  callId: string;
  executeTool(input: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  /** The build's lasting acts, as the dry run is given them (`./replay-draft.ts`): a step claiming one is checked, not repeated. */
  lastingActs?: ReadonlySet<string> | undefined;
  signal?: AbortSignal | undefined;
};

/** The word a step is shown under when it has nothing to run it with. */
const NOT_RUN = "not_run_in_this_build";

/** Run the proposed steps `from` through `to` (or the last), in order, on the target as it stands. */
export async function runAutomationStudioFlowDraftPart(input: AutomationStudioFlowDraftPartRunInput): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const range = rangeOf(input.value);
  if (!range) return refusal("run_flow.input_invalid", { expected: "{from: a step number, to?: a later step number}" });
  const proposed = input.steps.filter(automationStudioFlowDraftStepIsProposed);
  const last = proposed.at(-1);
  if (!last) return refusal("run_flow.nothing_in_flow");
  const positions = proposed.map((step) => step.position);
  const to = range.to ?? last.position;
  if (!positions.includes(range.from) || !positions.includes(to)) return refusal("run_flow.not_a_flow_step", { flowSteps: positions });
  if (to < range.from) return refusal("run_flow.input_invalid", { expected: "to at or after from" });
  const conditional = automationStudioFlowDraftConditionalStepIds(input.steps);
  const ran: JsonObject[] = [];
  let shown: { step: number; evidence: JsonValue } | undefined;
  let stoppedAt: number | undefined;
  let effectApplied = false;
  let before: string | undefined;
  let after: string | undefined;
  let first = true;
  for (const step of proposed.filter((each) => each.position >= range.from && each.position <= to)) {
    const mode = automationStudioFlowDraftStepReplayMode(step, input.lastingActs);
    const value = mode === "verify" ? automationStudioNodeReplayVerifyCall(step) : automationStudioNodeReplayStepCall(step);
    if (!value) {
      ran.push({ step: step.position, actionId: step.actionId, ran: NOT_RUN });
      stoppedAt = step.position;
      break;
    }
    const sent = await call(input, `${input.callId}.${step.position}`, automationStudioNodeReplayToolId(step), value);
    const answer = sent.readable ? sent.result : undefined;
    const status = answer ? automationStudioNodeReplayStatus(answer.resultCode, mode) : "failed";
    const outcome: AutomationStudioFlowDraftReplayOutcome = {
      step: step.position, actionId: step.actionId, status,
      ...(answer?.resultCode ? { resultCode: answer.resultCode } : {}),
      ...(mode === "verify" ? { mode } : {})
    };
    ran.push({ step: step.position, actionId: step.actionId, ran: automationStudioFlowDraftReplayOutcomeWord(outcome), ...(outcome.resultCode ? { resultCode: outcome.resultCode } : {}) });
    if (answer) {
      shown = { step: step.position, evidence: answer.evidence };
      effectApplied ||= answer.effectApplied;
      if (first) before = answer.stateDigests?.before;
      after = answer.stateDigests?.after;
    }
    first = false;
    if (status === "replayed" || conditional.has(automationStudioFlowDraftStepId(step))) continue;
    stoppedAt = step.position;
    break;
  }
  const passed = stoppedAt === undefined;
  const evidence: JsonObject = {
    ok: true, passed, from: range.from, to, steps: ran,
    ...(stoppedAt === undefined ? {} : { stoppedAt }),
    ...(shown ? { last: shown } : {}),
    instruction: instructionOf(range.from, to, stoppedAt)
  };
  return {
    kind: "llm_evidence_tool_execution",
    evidence,
    effectApplied,
    resultCode: passed ? "core.run_flow.ran" : "core.run_flow.stopped",
    ...(before !== undefined || after !== undefined ? { stateDigests: { ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) } } : {})
  };
}

/** `{from, to?}` when the argument is exactly that, with whole step numbers of at least 1. */
function rangeOf(value: JsonObject): { from: number; to?: number } | undefined {
  if (Object.keys(value).some((key) => key !== "from" && key !== "to")) return undefined;
  const step = (each: JsonValue | undefined): each is number => typeof each === "number" && Number.isInteger(each) && each >= 1;
  if (!step(value.from)) return undefined;
  if (value.to === undefined) return { from: value.from };
  return step(value.to) ? { from: value.from, to: value.to } : undefined;
}

/** What the model is told to do with the answer: never that the Flow is tested. */
function instructionOf(from: number, to: number, stoppedAt: number | undefined): string {
  const part = from === to ? `Step ${from}` : `Steps ${from} to ${to}`;
  const outcome = stoppedAt === undefined
    ? `${part} ran on the target as it stood, and passed.`
    : `${part} ran on the target as it stood, and stopped at step ${stoppedAt}: the target is where that step left it.`;
  return `${outcome} This is not the Flow's test: the Flow is finished only once it has run whole from its start and been judged.`;
}

/**
 * What one step's call answered. `unreadable` is named rather than left as an
 * absent answer, as in the dry run (`./replay-draft.ts`): an answer that could
 * not be parsed and a call that threw are both "this step did not
 * demonstrably run", a failed step that stops the run -- never "nothing to
 * check".
 */
type PartAnswer =
  | { readable: true; result: NonNullable<ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>> }
  | { readable: false };

/** One step's call. A cancelled run re-throws, so a stop is never recorded as a step that failed. */
async function call(input: AutomationStudioFlowDraftPartRunInput, callId: string, toolId: string, value: JsonObject): Promise<PartAnswer> {
  try {
    const ran = await input.executeTool({ callId, toolId, value, ...(input.signal ? { signal: input.signal } : {}) });
    const result = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
    return result ? { readable: true, result } : { readable: false };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return { readable: false };
  }
}

/** A refusal the model can act on, shaped as Core's own tools refuse (`./describe-nodes.ts`). */
function refusal(code: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, ...detail }, effectApplied: false, resultCode: code };
}
