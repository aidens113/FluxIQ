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
// always run. A pass that does not pass stops the run as a step does. A forward run
// differs in all of this: it takes the repeat's list in, and a pass that does not
// pass ends that pass alone (`../replay/forward.ts`).
//
// **Applied means a changing step acted (t195, `run-musr9pv3-f4bf6256`).** The
// run's `effectApplied` is what its changing steps did, never a read's: a read
// replayed answers applied, and that made a part run that read a list and only
// checked its press count as changing the page, so the loop's repeat guard
// never saw it change nothing, and one passing `{from: 15, to: 16}` ran about
// twenty times over an unchanged draft (`../repeat-guard/outcomes.ts`).
//
// **A switch of the result's list inside the run is told on its answer (`./result-list.ts`).** The model sees only
// the run's summary, so a pass that changed which rows the result holds had said so where it never read it.
//
// **A forward run's answer holds the page as it stands (t869).** A pass's answer
// carries no page, so the newest page the model held was the one from before
// the run, while the browser stood on the last row's; a handle read from that
// was refused `target_not_found` on a page it never named. The run ends with one
// look, the loop's own free one, and the answer carries it under the keys the
// domain declares as its view, so the loop's current view is this page. A look
// that is refused or cannot be read says so (`pageNotRead`), so the view the model
// still holds is not taken for the page as it stands.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AuthoringPartOfStep } from "../../../flow-authoring/bootstrap/record-defaults/index.ts";
import {
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftReplayPassWords,
  automationStudioFlowDraftStepIsProposed,
  type AutomationStudioFlowDraftStep
} from "../../../flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceViewGroups } from "../../decision-context/view-groups.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { automationStudioFlowDraftPartResultList } from "./result-list.ts";
import { automationStudioNodeReplayStepCall } from "../replay/replay.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_NO_ROWS_CODE, automationStudioFlowDraftReplaySteps } from "../replay/draft.ts";
import type { AutomationStudioFlowDraftReplayDefinitionOf, AutomationStudioFlowDraftReplayForward, AutomationStudioFlowDraftReplayNodeOf } from "../replay/index.ts";

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
  /** Each step's full node definition, as the dry run is given it: a read sends its assembled record output. */
  definitionOf?: AutomationStudioFlowDraftReplayDefinitionOf | undefined;
  /** The scoped task part, so the partial replay writes the saved Flow's record output. */
  partOf?: AuthoringPartOfStep | undefined;
  /**
   * The forward run (t861, plan D2, `../replay/forward.ts`): the range runs on the rows not yet done, a lasting step
   * acts for real on one, and the answer says what it did instead of calling itself a test. Absent, this is the
   * part run it always was.
   */
  forward?: AutomationStudioFlowDraftReplayForward | undefined;
  /** How a forward run looks at the page once it ends (see the header): the loop's free look, and which keys of its answer are the view. */
  look?: { toolId: string; input: JsonObject; observedStateKeys: readonly string[] } | undefined;
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
  const switched: JsonValue[] = [];
  const done = await automationStudioFlowDraftReplaySteps({
    executeTool: input.executeTool,
    ...(input.signal ? { signal: input.signal } : {}),
    steps: input.steps,
    run: proposed.filter((each) => each.position >= range.from && each.position <= to),
    callIdOf: (step) => `${input.callId}.${step.position}`,
    reanchor: false,
    ...(input.lastingActs ? { lastingActs: input.lastingActs } : {}),
    ...(input.nodeOf ? { nodeOf: input.nodeOf } : {}),
    ...(input.definitionOf ? { definitionOf: input.definitionOf } : {}),
    ...(input.partOf ? { partOf: input.partOf } : {}),
    ...(input.forward ? { forward: input.forward } : {}),
    // A step the Flow does not always run goes on, as the Flow would; one with
    // nothing to run it with stops the run whatever it says about when it runs.
    stopsAt: (step, excused) => !excused || unrunnable(step),
    answered: (step, answer) => {
      shown = { step: step.position, evidence: answer.evidence };
      switched.push(answer.evidence); // Any pass that switched the result's list says so in it (`./result-list.ts`).
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
  const rowsNotDone = done.rowsNotDone ?? [];
  const rowsStepFailed = done.rowsStepFailed ?? [];
  const noRows = done.outcomes.at(-1)?.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_NO_ROWS_CODE;
  const passed = stoppedAt === undefined && rowsNotDone.length === 0;
  const seen = input.forward && input.look ? await pageAsItStands(input, input.look) : undefined;
  if (seen?.after !== undefined) after = seen.after;
  const resultList = automationStudioFlowDraftPartResultList(switched);
  const evidence: JsonObject = {
    ...seen?.view,
    ...(resultList ? { resultList } : {}),
    ...(seen?.read === false ? { pageNotRead: true } : {}),
    ok: true, passed, from: range.from, to, steps: ran,
    ...(stoppedAt === undefined ? {} : { stoppedAt }),
    ...(shown ? { last: shown } : {}),
    ...(input.forward && done.rows ? { rows: done.rows } : {}),
    ...(rowsNotDone.length > 0 ? { rowsNotDone } : {}),
    instruction: input.forward ? forwardInstructionOf(range.from, to, stoppedAt, done.rows, rowsNotDone, rowsStepFailed, noRows) : instructionOf(range.from, to, stoppedAt)
  };
  return {
    kind: "llm_evidence_tool_execution",
    evidence,
    effectApplied,
    resultCode: stoppedAt === undefined ? "core.run_flow.ran" : "core.run_flow.stopped",
    ...(before !== undefined || after !== undefined ? { stateDigests: { ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) } } : {})
  };
}

/** One look at the page, and what of its answer is the view (see the header); `read: false` for a look that was refused or could not be read. */
async function pageAsItStands(input: AutomationStudioFlowDraftPartRunInput, look: NonNullable<AutomationStudioFlowDraftPartRunInput["look"]>): Promise<{ read: boolean; view?: JsonObject; after?: string }> {
  const members = automationStudioLlmEvidenceViewGroups(look.observedStateKeys).find((group) => group.holder === undefined)?.members ?? [];
  try {
    const ran = await input.executeTool({ callId: `${input.callId}.look`, toolId: look.toolId, value: structuredClone(look.input), ...(input.signal ? { signal: input.signal } : {}) });
    const answer = automationStudioLlmEvidenceParseToolExecutionResult(ran, "observe");
    const evidence = answer?.evidence;
    if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence) || evidence.ok === false) return { read: false };
    const view = Object.fromEntries(Object.entries(evidence).filter(([key]) => members.includes(key)));
    if (Object.keys(view).length === 0) return { read: false };
    return { read: true, view, ...(answer?.stateDigests?.after !== undefined ? { after: answer.stateDigests.after } : {}) };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return { read: false };
  }
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
 * What the model is told after a forward run: where it ran, how many rows it did and left out, and where it stopped.
 * Counts only; never that the Flow is tested or must be finished, because this is the work being done.
 */
function forwardInstructionOf(from: number, to: number, stoppedAt: number | undefined, rows: { done: number; skipped: number; failed: number } | undefined, rowsNotDone: readonly string[], rowsStepFailed: readonly string[], noRows: boolean): string {
  const part = from === to ? `Step ${from}` : `Steps ${from} to ${to}`;
  const counted = rows ? ` Rows: ${rows.done} done, ${rows.skipped} skipped as already done, ${rows.failed} failed.` : "";
  const quoted = (names: readonly string[]): string => names.map((row) => JSON.stringify(row)).join(", ");
  const notFound = rowsNotDone.filter((row) => !rowsStepFailed.includes(row));
  const notDone = [
    notFound.length > 0 ? ` These rows were not done, because each one's own control could not be found, and nothing was done to them: ${quoted(notFound)}.` : "",
    rowsStepFailed.length > 0 ? ` These rows were not finished, because a step failed on each one, so look at what the page shows for them: ${quoted(rowsStepFailed)}.` : "",
    rowsNotDone.length > 0 ? " See to them another way, or say in your answer that they were not done." : ""
  ].join("");
  if (noRows) return `${part} ran forward from where the page stood and stopped at step ${stoppedAt}: the list it repeats over answered no rows, so nothing of the repeat was sent, and nothing after it. The page is where the last step left it.${counted}${notDone}`;
  if (stoppedAt !== undefined) return `${part} ran forward from where the page stood and stopped at step ${stoppedAt}: the page is where that step left it, and nothing after it was sent.${counted}${notDone}`;
  return notDone
    ? `${part} ran forward from where the page stood, on what was not done yet, and went on past the rows it could not do.${counted}${notDone}`
    : `${part} ran forward from where the page stood, on what was not done yet, and passed.${counted}`;
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
