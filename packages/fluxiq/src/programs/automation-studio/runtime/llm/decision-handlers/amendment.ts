// A decision to edit the draft: carried out, refused with the reason, or --
// for a `rerun` -- turned into the call that does the step again, with the
// decision's amendments naming that step held until it has run.
import { applyAutomationStudioFlowDraftAmendments, automationStudioFlowDraftClaimAct, automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLlmDecisionContextSignature, automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENTS_REFUSED_CODE, automationStudioLlmEvidenceDraftAmendmentFeedback } from "../draft-amendment-feedback.ts";
import {
  automationStudioLlmEvidenceHeldAmendments,
  automationStudioLlmEvidenceLoopFailure as failure,
  automationStudioLlmEvidenceRerunRequest,
  type AutomationStudioLlmEvidenceLoopDecision,
  type AutomationStudioLlmEvidenceLoopDraftChange,
  type AutomationStudioLlmEvidenceLoopTrace
} from "../evidence-loop/index.ts";
import { automationStudioLlmStepLogAnswer } from "../step-log/index.ts";
import { automationStudioLlmEvidenceRepeatStop } from "./refused-repeat.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext, AutomationStudioLlmEvidenceRerunHeld } from "./types.ts";
import { automationStudioRerunArgumentNote, type AutomationStudioRerunArgumentMetadata, type AutomationStudioRerunAttempt } from "../rerun-arguments/index.ts";

/**
 * Answers one `amend_draft` decision. `canAmend` is whether this iteration
 * offered editing at all.
 */
export function automationStudioLlmEvidenceHandleAmendment(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "amend_draft" }>,
  canAmend: boolean
): AutomationStudioLlmEvidenceDecisionNext {
  const { trace, accounting, draftSteps, amendmentMemory, noProgress, counters } = context;
  const end = (code: Parameters<typeof failure>[1]): { kind: "end"; result: ReturnType<typeof failure> } => ({ kind: "end", result: failure(draftSteps, code, trace, accounting) });
  context.repeats.acted(); // Not a look: a run of looks is over (`../repeat-guard/searching.ts`).
  // Acting on an edit the model was not offered would let a draft be
  // edited after the allowance for editing it had run out.
  if (!canAmend) return end("llm_evidence_loop.invalid_decision");
  counters.draftAmendments += 1;
  counters.unusableInARow = 0;
  // One amendment cannot be carried out here, because it has to run
  // something: `rerun` replaces a step by doing it again with a corrected
  // argument. The call that follows goes the ordinary tool-call path, so it
  // is recorded, digested and checked like any other; the step it replaces
  // is found before a reorder beside it renumbers the draft, and withdrawn
  // only once that call has worked (`../evidence-loop/rerun-replacement.ts`).
  const rerun = automationStudioLlmEvidenceRerunRequest(decision.amendments, draftSteps, context.toolIds, (toolId, input, at) => context.repeats.blocks(toolId, input, at) !== undefined, context.input.deniedEvidenceKeys);
  // An amendment naming the step the rerun replaces is about the step that
  // will replace it, so it waits for the rerun; the rest apply now, in order
  // (`../evidence-loop/held-amendments.ts`, live run `run-mup2i28c-6c7fc209`).
  const split = automationStudioLlmEvidenceHeldAmendments(decision.amendments, draftSteps, rerun.request?.step);
  const targetedStepIds = [...new Set(decision.amendments.flatMap((amendment) => {
    const step = draftSteps.find((candidate) => candidate.position === amendment.step);
    return step?.id ? [step.id] : [];
  }))];
  const rerunReplaces = rerun.request ? draftSteps.find((candidate) => candidate.position === rerun.request!.step) : undefined;
  // Which node each position held before the edit, so a refused amendment
  // is recorded with the node it was about (`../evidence-loop/trace.ts`).
  const nodeAt = new Map(draftSteps.map((step) => [step.position, step.actionId] as const));
  // Which steps were in before the edit, by the position the model named them
  // at: a kept step that had changed the page and is out afterwards is one this
  // decision withdrew, which is the history's to show (run 6 withdrew a store
  // switch that had worked, then ran it twice more).
  const keptBefore = new Map(draftSteps.filter((step) => step.disposition === "kept").map((step) => [step, step.position] as const));
  amendmentMemory.before(iteration, draftSteps);
  const amended = applyAutomationStudioFlowDraftAmendments(draftSteps, split.now);
  // Edits that put the draft back exactly as it stood changed nothing about the Flow.
  const sameDraftAs = rerun.request || !amended.applied ? undefined : amendmentMemory.after(iteration, draftSteps);
  // **Every refusal of this decision on one path, the draft's and the
  // loop's own.** A `rerun` is filtered out of the apply call above, so the
  // draft never sees one and never refuses one -- and a rerun this loop
  // could not carry out was therefore the one amendment that changed
  // nothing silently, on a build where every other kind had been telling the
  // model why since t140. The row records both and the model is shown both.
  const refused = [...amended.refused, ...rerun.refused].map((refusal) => nodeAt.has(refusal.step) ? { ...refusal, nodeId: nodeAt.get(refusal.step)! } : refusal);
  // Marked `repeated` where this build already gave the refusal, and recorded
  // as given: asked once, for the history and the feedback both.
  const refusals = amendmentMemory.refusals(refused);
  const withdrewChanged = [...keptBefore].flatMap(([step, position]) => step.disposition !== "kept" && step.effect === "mutate" && step.effectApplied === true ? [position] : []).sort((left, right) => left - right);
  context.history.record(iteration, {
    kind: "amendment",
    signature: automationStudioLlmDecisionContextSignature(decision),
    applied: amended.applied + (rerun.request ? 1 : 0),
    refusals: refusals.map((refusal) => ({ step: refusal.step, reason: refusal.reason, repeated: refusal.repeated === true })),
    withdrewChanged,
    ...(sameDraftAs !== undefined ? { undoneTo: sameDraftAs } : {}),
    ...(rerun.request ? { rerun: rerun.request.step } : {})
  });
  // How many steps the decision edited, beside which kind of edit it was
  // (`../evidence-loop/draft-change.ts` says why a count had to join the word).
  const draftChange: AutomationStudioLlmEvidenceLoopDraftChange = {
    targetedStepIds,
    appliedCount: amended.applied + (rerun.request ? 1 : 0),
    refusedCount: refused.length,
    keptStepCount: draftSteps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
    ...(rerunReplaces?.id ? { rerunStepId: rerunReplaces.id } : {})
  };
  context.recordRow(
    { iteration, decision: "amend_draft", resultCode: rerun.request ? "llm_evidence_loop.draft_rerun" : sameDraftAs !== undefined ? "llm_evidence_loop.draft_amendment_undone" : amended.applied ? "llm_evidence_loop.draft_amended" : "llm_evidence_loop.draft_unchanged", amended: amended.applied, ...(refused.length ? { amendmentsRefused: refused } : {}), ...(decision.usage ? { usage: decision.usage } : {}) },
    { draftChanged: Boolean(amended.applied || rerun.request), draftChange }
  );
  // An edit is progress on the draft and never on the evidence, so an edit
  // that landed neither clears the no-progress guard nor is spent by it --
  // and an edit that changed nothing does count, because that guard is the
  // only thing that stops a model editing one step forever. Six of these in
  // a row, all `draft_unchanged` with the same two step ids refused each
  // time, is the first half of `run-mulum3x7-18ceeb75`, so the redirection
  // is what the sixth gets rather than nothing at all.
  // A repeat counts against the round like a refused call (`./refused-repeat.ts`): a
  // rerun refused as one, or a decision whose every amendment was refused the
  // same way before -- run 36 sent `25 keep act a1` seven times, refused each time.
  const repeatedOnly = !rerun.request && !amended.applied && refusals.length > 0 && refusals.every((refusal) => refusal.repeated === true);
  const rerunRepeated = rerun.refused.some((refusal) => refusal.reason === "changes_nothing");
  if (rerunRepeated || repeatedOnly) {
    // A round stalled on amendments refused again is said as that, not as a refused call (`../../flow-bootstrap/unfinished-build/not-done.ts`).
    const stop = automationStudioLlmEvidenceRepeatStop(context, context.repeats.refusedAgain(iteration), rerunRepeated ? undefined : AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENTS_REFUSED_CODE);
    if (stop?.kind === "stalled") {
      if (context.input.propagateDecisionErrors) throw stop.error;
      return end("llm_evidence_loop.repeat_without_progress");
    }
    if (stop) return stop;
  } else if (!rerun.request && (!amended.applied || sameDraftAs !== undefined)) {
    noProgress.stepped();
    if (noProgress.reached()) return end("llm_evidence_loop.repeat_without_progress");
    noProgress.redirect(iteration);
  } else if (!rerun.request && context.authored?.advanced()) {
    // Where the model authors its draft, an edit that put a step in the Flow
    // for the first time, or left fewer acts undone than ever, is the draft
    // advancing, which is what progress means there
    // (`../evidence-progress/authored-progress.ts`). A toggle is not.
    noProgress.cleared();
  }
  // The model is told which of its amendments changed nothing and why, as
  // evidence, before it is asked again -- the same way a refused completion
  // is. After the guard, so the count it is shown is the one it is being
  // held to; whenever anything was refused, because an edit that half landed
  // is one the model must still be told about. Where amendments wait for the
  // rerun, the whole decision is told once they are settled, below.
  // `applied` counts a rerun the decision asked for, as the row's draft change
  // and the history do: step 0061 of `run-musq0b1m-0472cfa0` was told 0 beside
  // an `appliedCount` of 1 (t174-w116).
  // An act moved off a step left in the Flow is told too, on an edit that
  // landed whole: information, never a refusal (`../draft-amendment-feedback.ts`, `moved`).
  const moved = amended.moved ?? [];
  if ((refused.length || sameDraftAs !== undefined || moved.length) && !split.held.length) tell(context, iteration, refusals, amended.applied + (rerun.request ? 1 : 0), sameDraftAs, moved);
  if (rerun.retainedRefusals?.length) {
    automationStudioLlmDecisionContextSupersede(context.evidence, "core.rerun_check");
    for (const refusal of rerun.retainedRefusals) tellRetained(context, iteration, refusal.retained, { kind: "refused", reason: refusal.reason });
  }
  if (!rerun.request) return { kind: "continue" };
  const held: AutomationStudioLlmEvidenceRerunHeld | undefined = rerunReplaces
    ? { amendments: split, nodeId: rerunReplaces.actionId, applied: amended.applied, refusals: split.held.length ? refusals : [], ...(split.held.length && moved.length ? { moved } : {}), ...(rerun.request.retained ? { retained: rerun.request.retained } : {}) }
    : undefined;
  return { kind: "rerun", decision: { kind: "tool_call", callId: rerun.request.callId, toolId: rerun.request.toolId, input: rerun.request.input }, replaces: rerunReplaces, ...(held ? { held } : {}) };
}

/**
 * Settle the amendments a decision held for its rerun, once the rerun has run:
 * applied to the step that replaced theirs, or refused `did_not_work` when the
 * rerun did not work or never ran (`rerun` absent). The model is told the
 * decision's refusals together, as it would have been without the wait.
 * Answers what the rerun's own row records of them.
 */
export function automationStudioLlmEvidenceSettleHeldAmendments(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  held: AutomationStudioLlmEvidenceRerunHeld,
  rerun: AutomationStudioFlowDraftStep | undefined,
  attempt: AutomationStudioRerunAttempt
): Pick<AutomationStudioLlmEvidenceLoopTrace, "amended" | "amendmentsRefused"> {
  automationStudioLlmDecisionContextSupersede(context.evidence, "core.rerun_check");
  if (held.retained) tellRetained(context, iteration, held.retained, attempt);
  const settled = held.amendments.settle(context.draftSteps, rerun);
  const refused = settled.refused.map((refusal) => ({ ...refusal, nodeId: held.nodeId }));
  const refusals = [...held.refusals, ...context.amendmentMemory.refusals(refused)];
  if (refusals.length || held.moved?.length) tell(context, iteration, refusals, held.applied + settled.applied, undefined, held.moved ?? []);
  return held.amendments.held.length ? { amended: settled.applied, ...(refused.length ? { amendmentsRefused: refused } : {}) } : {};
}

function tellRetained(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, metadata: AutomationStudioRerunArgumentMetadata, attempt: AutomationStudioRerunAttempt): void {
  const value = automationStudioRerunArgumentNote(metadata, attempt);
  if (!value) return;
  context.accountEvidence(value);
  context.evidence.push({ callId: `core.rerun_check.${iteration}.${metadata.step}`, toolId: "core.rerun_check", value });
}

/**
 * Records that `step`, a call just put into the Flow with `act`, does that act
 * and no other step does (`../../flow-draft/act-claim.ts`), and tells the model
 * of each step the act left in the Flow doing no act, as an answer that
 * refused nothing: information, never a refusal and never a drop. Live run
 * `run-musp4h2f-72e8ed99` moved a3 this way at step 0144, by a `core.run_node`
 * write with `act a3`, and the 3-Pack press it left was pressed again in the
 * next test with no word to the model (`../evidence-loop.ts`).
 */
export function automationStudioLlmEvidenceClaimWrittenAct(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  step: AutomationStudioFlowDraftStep,
  act: string
): void {
  const moved = automationStudioFlowDraftClaimAct(context.draftSteps, step, act)
    .filter((left) => automationStudioFlowDraftStepIsProposed(left) && !left.acts?.length)
    .map((left) => ({ act, from: left.position, to: step.position }));
  if (moved.length) tell(context, step.iteration, [], 1, undefined, moved);
}

/**
 * The model is told which of its amendments changed nothing and why, and which
 * acts moved off a step left in the Flow (`moved`), as evidence, before it is
 * asked again; a newer telling replaces the older.
 * What it is told joins the decision's answer step as `told`
 * (`../step-log/answer-step.ts`): it is built after the decision's row was
 * recorded, because it carries the guard's count of that row, so the answer
 * step written as the row entered the record could hold only the codes
 * (t174-w108 and t174-w116 R3, `run-musq0b1m-0472cfa0` step 0061).
 */
function tell(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  refusals: AutomationStudioLlmEvidenceRerunHeld["refusals"],
  applied: number,
  sameDraftAs: number | undefined,
  moved: NonNullable<AutomationStudioLlmEvidenceRerunHeld["moved"]>
): void {
  const amendmentFeedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals, applied, steps: context.draftSteps, stepsWithoutProgress: context.noProgress.steps, maxStepsWithoutProgress: context.limits.maxStepsWithoutProgress,
    ...(sameDraftAs === undefined ? {} : { sameDraftAsIteration: sameDraftAs }),
    ...(moved.length ? { moved } : {}),
    // What is still to do, for an act named again that the checklist shows done (`../draft-amendment-feedback.ts`).
    actsNotDone: context.input.draft ? context.input.draft.actsMissing?.(context.draftSteps) : undefined
  });
  context.accountEvidence(amendmentFeedback);
  automationStudioLlmDecisionContextSupersede(context.evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID);
  context.evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, value: amendmentFeedback });
  const row = [...context.trace].reverse().find((candidate) => candidate.iteration === iteration && candidate.decision === "amend_draft");
  if (row) automationStudioLlmStepLogAnswer(row, process.env, amendmentFeedback);
}
