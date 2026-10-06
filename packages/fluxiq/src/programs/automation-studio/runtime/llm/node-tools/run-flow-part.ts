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
//
// **The dry run's own walker (t252).** The steps are sent by the same walk the
// dry run makes after its reset (`./replay-draft.ts`), so a repeat whose list
// step is in the range runs once per row its list returned here, and bindings
// are resolved the same way (`./replay-span.ts`); one whose list step is not in
// the range has no rows to walk and runs once, as a step the Flow does not
// always run. A pass that does not pass stops the run as a step does.
//
// **Applied means a changing step acted (t195, `run-musr9pv3-f4bf6256`).** The
// run's `effectApplied` is what its changing steps did, never a read's: a read
// replayed answers applied, and that made a part run that read a list and only
// checked its press count as changing the page, so the loop's repeat guard
// never saw it change nothing, and one passing `{from: 15, to: 16}` ran about
// twenty times over an unchanged draft (`../repeat-guard/outcomes.ts`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftReplayPassWords,
  automationStudioFlowDraftStepIsProposed,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { automationStudioNodeReplayStepCall } from "./replay.ts";
import { automationStudioFlowDraftReplaySteps } from "./replay-draft.ts";
import type { AutomationStudioFlowDraftReplayNodeOf } from "./replay-span.ts";

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
  /** The node each step names, as the dry run is given it (`./replay-draft.ts`): what lets a repeat run once per row. */
  nodeOf?: AutomationStudioFlowDraftReplayNodeOf | undefined;
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
  let shown: { step: number; evidence: JsonValue } | undefined;
  let effectApplied = false;
  let before: string | undefined;
  let after: string | undefined;
  let first = true;
  const done = await automationStudioFlowDraftReplaySteps({
    executeTool: input.executeTool,
    ...(input.signal ? { signal: input.signal } : {}),
    steps: input.steps,
    run: proposed.filter((each) => each.position >= range.from && each.position <= to),
    callIdOf: (step) => `${input.callId}.${step.position}`,
    reanchor: false,
    ...(input.lastingActs ? { lastingActs: input.lastingActs } : {}),
    ...(input.nodeOf ? { nodeOf: input.nodeOf } : {}),
    // A step the Flow does not always run goes on, as the Flow would; one with
    // nothing to run it with stops the run whatever it says about when it runs.
    stopsAt: (step, excused) => !excused || unrunnable(step),
    answered: (step, answer) => {
      shown = { step: step.position, evidence: answer.evidence };
      effectApplied ||= step.effect === "mutate" && answer.effectApplied; // A read replayed moved nothing (see the header).
      if (first) before = answer.stateDigests?.before;
      after = answer.stateDigests?.after;
      first = false;
    }
  });
  const ran: JsonObject[] = done.outcomes.map((outcome) => {
    const step = proposed.find((each) => each.position === outcome.step);
    if (step && unrunnable(step)) return { step: outcome.step, actionId: outcome.actionId, ran: NOT_RUN };
    return {
      step: outcome.step, actionId: outcome.actionId, ran: automationStudioFlowDraftReplayOutcomeWord(outcome),
      ...(outcome.resultCode ? { resultCode: outcome.resultCode } : {}),
      ...automationStudioFlowDraftReplayPassWords(outcome)
    };
  });
  const stoppedAt = done.stoppedAt;
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
 * Whether a step has nothing to run it with: one carried from an earlier Flow
 * that never ran in this build (`./draft-from-flow.ts`). Nothing is sent for
 * it, and it stops the run (see the header).
 */
function unrunnable(step: AutomationStudioFlowDraftStep): boolean {
  return automationStudioNodeReplayStepCall(step) === undefined;
}

/** A refusal the model can act on, shaped as Core's own tools refuse (`./describe-nodes.ts`). */
function refusal(code: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, ...detail }, effectApplied: false, resultCode: code };
}
