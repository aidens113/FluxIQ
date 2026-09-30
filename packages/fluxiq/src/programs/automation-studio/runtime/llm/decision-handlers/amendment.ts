// A decision to edit the draft: carried out, refused with the reason, or --
// for a `rerun` -- turned into the call that does the step again.
import { applyAutomationStudioFlowDraftAmendments, automationStudioFlowDraftStepIsProposable } from "../../flow-draft/index.ts";
import { automationStudioLlmDecisionContextSignature, automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, automationStudioLlmEvidenceDraftAmendmentFeedback } from "../draft-amendment-feedback.ts";
import {
  automationStudioLlmEvidenceLoopFailure as failure,
  automationStudioLlmEvidenceRerunRequest,
  type AutomationStudioLlmEvidenceLoopDecision,
  type AutomationStudioLlmEvidenceLoopDraftChange
} from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext } from "./types.ts";

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
  const { limits, trace, accounting, draftSteps, amendmentMemory, noProgress, counters, evidence } = context;
  const end = (code: Parameters<typeof failure>[1]): { kind: "end"; result: ReturnType<typeof failure> } => ({ kind: "end", result: failure(draftSteps, code, trace, accounting) });
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
  const rerun = automationStudioLlmEvidenceRerunRequest(decision.amendments, draftSteps, context.toolIds);
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
  const amended = applyAutomationStudioFlowDraftAmendments(draftSteps, decision.amendments.filter((amendment) => amendment.change !== "rerun"));
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
  if (!rerun.request && (!amended.applied || sameDraftAs !== undefined)) {
    noProgress.stepped();
    if (noProgress.reached()) return end("llm_evidence_loop.repeat_without_progress");
    noProgress.redirect(iteration);
  }
  // The model is told which of its amendments changed nothing and why, as
  // evidence, before it is asked again -- the same way a refused completion
  // is. After the guard, so the count it is shown is the one it is being
  // held to; whenever anything was refused, because an edit that half landed
  // is one the model must still be told about.
  if (refused.length || sameDraftAs !== undefined) {
    const amendmentFeedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals, applied: amended.applied, steps: draftSteps, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress,
      ...(sameDraftAs === undefined ? {} : { sameDraftAsIteration: sameDraftAs })
    });
    context.accountEvidence(amendmentFeedback);
    automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID);
    evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, value: amendmentFeedback });
  }
  if (!rerun.request) return { kind: "continue" };
  return { kind: "rerun", decision: { kind: "tool_call", callId: rerun.request.callId, toolId: rerun.request.toolId, input: rerun.request.input }, replaces: rerunReplaces };
}
