// A repair's `complete` on the very Flow the judge said does not do what was
// asked, refused as the identical retry of a failed act it is.
//
// **The rule (user).** One general guard refuses an identical retry of a failed
// act on an unchanged state. A judged `no` is that failure for a build: the
// Flow was tested from its start and judged not to do what the instruction
// asks. Completing the same Flow again asks for the same test and the same
// judgement of it, so it is refused while the model can still change the Flow.
//
// **What it fixes (live run murwcmx2, cause C-C).** Build repair round 1 ran
// the Flow the judge had sent back, saw the same rows and completed it with no
// change; the completion check accepted it, the test ran again, and one judge
// call said yes, which then stood alone: the build finished on a Flow two
// judges had said was wrong.
//
// **Only after a `no`.** An `unknown` or `not_judged` verdict refuted nothing
// -- the judge was unsure, could not run, or judged another version -- so
// testing the same Flow again can still settle it, and is never refused here.
//
// Two drafts are the same Flow exactly when their Flow signatures are equal
// (`../../flow-draft/flow-signature.ts`): what changes without the Flow
// changing -- the call a step was decided in, its position, what the last
// replay answered -- is not compared.
//
// **Only where the draft is the Flow.** The completion check builds the Flow
// from the draft when every step in it is one Core can write down itself (the
// caller's `writable`, `automationStudioFlowBootstrapDraftStepIsWritable`);
// otherwise from the plan the reply carried, and a reply can carry a corrected
// plan over an unchanged draft. The draft says nothing about that Flow, so a
// completion built from the reply is never refused here.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftFlowSignature, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceLoopResume } from "../../llm/evidence-loop/index.ts";

/** The issue code a completion of the unchanged refuted Flow is refused with. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG = "bootstrap.flow_unchanged_since_judged_wrong";

const INSTRUCTION = "This is the Flow the judge said does not do what was asked (judgement.judge), unchanged: testing it again tests the same thing, so completing it again is refused. "
  + "Change what judgement.judge.advice names, then complete. "
  + "Completing it unchanged is refused every time, and a round that changes nothing ends the build as not doable.";

/**
 * The refusal for a repair round's completion of the Flow its judge said does
 * not do what was asked, unchanged; nothing for any other completion -- no
 * repair, a seed with no steps, a verdict other than `no`, a Flow built from
 * the reply rather than the draft, or a changed Flow.
 */
export function automationStudioFlowBootstrapUnchangedCompleteRefusal(input: {
  /** The round's repair: the Flow it started from and the entry its first decision read. Absent for the exploration. */
  repair?: { seed: readonly AutomationStudioFlowDraftStep[]; resume: AutomationStudioLlmEvidenceLoopResume } | undefined;
  /** The draft the model completed. */
  steps: readonly AutomationStudioFlowDraftStep[];
  /** Whether the completion check can write this step down itself: when every step in the Flow is, the Flow is built from the draft. */
  writable(step: AutomationStudioFlowDraftStep): boolean;
}): Extract<AutomationStudioLlmEvidenceCompletionCheck, { ok: false }> | undefined {
  const judge = judgeOf(input.repair?.resume);
  if (!input.repair?.seed.length || judge?.verdict !== "no") return undefined;
  const inFlow = input.steps.filter(automationStudioFlowDraftStepIsProposed);
  if (!inFlow.length || !inFlow.every((step) => input.writable(step))) return undefined;
  if (automationStudioFlowDraftFlowSignature(input.steps) !== automationStudioFlowDraftFlowSignature(input.repair.seed)) return undefined;
  const advice = typeof judge.advice === "string" && judge.advice ? { advice: judge.advice } : {};
  return {
    ok: false,
    issueCodes: [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG],
    feedback: { ok: false, code: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG, verdict: "no", ...advice, instruction: INSTRUCTION }
  };
}

/** The judge's account in a repair's judgement, where a judge sent the Flow back. */
function judgeOf(resume: AutomationStudioLlmEvidenceLoopResume | undefined): JsonObject | undefined {
  const judge = resume?.judgement?.judge;
  return judge !== null && typeof judge === "object" && !Array.isArray(judge) ? judge : undefined;
}
