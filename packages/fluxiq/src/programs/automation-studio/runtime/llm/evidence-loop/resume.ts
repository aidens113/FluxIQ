// What a build that continues an exhausted one is told before its first
// decision.
//
// A build that ran out of decisions used to leave nothing behind: its draft
// went with it, and `run-mulx76vv-a882551e` discarded twelve proved steps. The
// caller now keeps that draft as an incomplete record
// (`../../flow-bootstrap/incomplete-draft/`) and a continuation seeds the loop
// from it (`../loop-configuration.ts`, `draft.seed` and `draft.resume`). What
// makes the seed a continuation rather than a stale list:
//
//   - **It carries on live.** A continuation is still the build's live phase,
//     and nothing in that phase replays the draft from its first step (user,
//     2026-09-30: a full replay belongs to the judgement once the Flow is
//     declared ready, never to exploration). Until then the loop replayed the
//     whole draft before the first decision to put the page where the draft
//     leaves it. Now the model is told the page is wherever it stands and to
//     get to where its draft leaves off by the shortest way, without repeating
//     the draft; the Flow is tested in full once it says it is ready.
//   - **The model is told what it still owes.** The completion failures the last
//     build had not answered, by code, and why it stopped.
//
// **The same entry opens a repair (t208).** A build that stopped before the
// model said its Flow was ready no longer just ends: what it had is tested and
// judged, and a repair carries on live from where the test left the page
// (`../../flow-bootstrap/unfinished-build/`). The repair is told so, with the
// judgement -- what the test did and how much of the checklist is done -- in
// place of a continuation's words.
//
// **A Flow the judge sent back is repaired with the judge's account (t195).**
// A Flow the model said was ready is tested from its start and the test's
// results judged against the instruction; one judged wrong is repaired from
// what the judge said it did not do, what was asked and what to change. The
// acts checklist is then information, not the bar. Steps carried from an
// earlier Flow that its test never ran are named, to be run again live.
//
// Codes, counts and Core's own words, plus the judge's words, which the judge
// screened before they reached the judgement: nothing here is page content, so
// the entry rides where every other Core entry does.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopExhaustedBound } from "./exhaustion.ts";

/** The evidence entry a continued build's first decision reads. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID = "core.resumed";

/** What a continuation is told about the build it continues. */
export type AutomationStudioLlmEvidenceLoopResume = {
  /** Which version of the incomplete draft this continues, counting from 1. */
  revision: number;
  /**
   * Which allowance the build it continues ran out of, `unusable_decisions`
   * when that build ended because its decisions kept coming back unusable --
   * most often completions the checks kept refusing -- rather than on a count,
   * or `repeat_without_progress` when its no-progress guard stopped it, or
   * `judged_wrong` when it finished and the judge of its test sent it back.
   */
  stopped: AutomationStudioLlmEvidenceLoopExhaustedBound | "unusable_decisions" | "repeat_without_progress" | "judged_wrong";
  /** The completion failures that build had not answered, by issue code. */
  outstandingIssueCodes: readonly string[];
  /**
   * Present on a repair of this same build: the judgement of the Flow as it
   * stood, in Core's codes and counts (`../../flow-bootstrap/unfinished-build/judgement.ts`).
   */
  judgement?: JsonObject;
};

const INSTRUCTION = "This build continues one that ran out of decisions before it finished. "
  + "Your draft is the steps it proved. They were not run again: the page is wherever it now stands, so look first, and if it is not where your draft leaves off, get there the shortest way and mark any step you take only to get there exploratory (amend_draft) so the Flow does not repeat it. "
  + "The whole Flow is run once from where it starts when you complete, and a step that does not replay then is what you correct. "
  + "outstanding is what refused its last attempt to finish: correct each one, do whatever the instruction asks that your draft does not yet do, and complete. "
  + "Do not repeat work the draft already holds.";

const REPAIR_INSTRUCTION = "This is the repair of a Flow that was not finished when the build stopped (stopped says why). "
  + "What it had was tested from where it starts and judged: judgement says what the test found and how much of the acts checklist is done. "
  + "Your draft is that Flow. The page is wherever the test left it, so look first. "
  + "Work live on what is failing or missing, one act or choice at a time, and add each step the Flow needs, naming the act or choice it does (act a2, or a2.quantity). "
  + "Correct or drop a step the test found not working. Do not repeat work the draft already holds. "
  + "The whole Flow is tested again from where it starts when you complete: complete when the Flow does what the instruction asks.";

const JUDGED_INSTRUCTION = "The Flow you said was ready was tested from its start and judged against the instruction: judgement.judge says what it did not do (observed), what was asked (expected) and what to change (advice), and findings says why. "
  + "Your draft is that Flow. The page is where the test left it: look first. "
  + "Work live on exactly that: correct or replace the step that does the wrong thing, and add each step the Flow still needs, naming the act or choice it does (act a2, or a2.quantity). "
  + "Do not repeat work the draft already holds. "
  + "The acts checklist is the build's own reading and is information, not the bar: the Flow is judged on what its test does. "
  + "The whole Flow is tested again from where it starts and judged again when you complete: complete when the Flow does what the instruction asks.";

const UNJUDGED_INSTRUCTION = "The Flow you said was ready could not be judged against the instruction: its test did not run every step, so there is no evidence that what those steps claim is done (judgement.judge.findings says why). "
  + "Your draft is that Flow. The page is where the test left it: look first. "
  + "Do not repeat work the draft already holds. "
  + "The acts checklist is the build's own reading and is information, not the bar: the Flow is judged on what its test does. "
  + "The whole Flow is tested again from where it starts and judged again when you complete: complete when the Flow does what the instruction asks.";

/** The judge's account in a repair's judgement, when a judge sent the Flow back. */
function judgedBy(resume: AutomationStudioLlmEvidenceLoopResume): JsonObject | undefined {
  const judge = resume.judgement?.judge;
  return judge !== null && typeof judge === "object" && !Array.isArray(judge) ? judge : undefined;
}

/**
 * The repair instruction after a judge: the judged one, then the steps carried
 * from an earlier Flow that its test did not run, to be run again live.
 */
function judgedInstruction(judge: JsonObject): string {
  const carried = Array.isArray(judge.untestedCarried) ? judge.untestedCarried.filter((position): position is number => Number.isSafeInteger(position) && (position as number) > 0) : [];
  const lead = judge.verdict === "no" ? JUDGED_INSTRUCTION : UNJUDGED_INSTRUCTION;
  if (!carried.length) return lead;
  return `${lead} Steps ${carried.join(", ")} were carried from the earlier Flow and not run in this build: rerun them live (amend_draft rerun), so the test runs them.`;
}

const EXPLORE_AGAIN_INSTRUCTION = "Nothing is in the Flow yet: the build stopped (stopped says why) before any step you ran was added to it. "
  + "That does not end the build. The acts checklist beside the draft lists everything the person asked, all still to do, and judgement.lastRefusedFor says what refused your last attempts to finish. "
  + "Keep exploring live from the page as it stands -- look first -- and do not repeat what was refused or answered already: try another way to what the checklist asks. "
  + "Add each step the Flow needs as you run it (add true), naming the act or choice it does (act a2, or a2.quantity). "
  + "Complete when the Flow does what the instruction asks: it is then tested from its start and judged on what it does; the checklist is the build's own reading, information, not the bar.";

/** Said after the explore-again instruction when the Flow the model said was ready was judged and sent back. */
const EXPLORE_AGAIN_JUDGED = "The Flow you said was ready was tested from its start and judged: judgement.judge says what it did not do (observed), what was asked (expected) and what to change (advice). Go by that, and add each step you run that the Flow needs.";

/** Whether this entry opens a round after one that left nothing in the Flow. */
function nothingInFlow(resume: AutomationStudioLlmEvidenceLoopResume): boolean {
  return resume.judgement !== undefined && resume.judgement.stepsInFlow === 0;
}

/** What the entry tells the model to do: explore again, repair after a judge, repair, or continue. */
function instructionFor(resume: AutomationStudioLlmEvidenceLoopResume): string {
  const judge = judgedBy(resume);
  // A Flow the judge sent back can leave nothing in the Flow (a plan that came
  // with the reply, not from steps run and added): exploring again then goes by
  // what the judge found, which the round would otherwise never be told
  // (t195-w29, `../../tests/deepseek-bootstrap/tests/answerability.test.ts`).
  if (nothingInFlow(resume)) return judge ? `${EXPLORE_AGAIN_INSTRUCTION} ${EXPLORE_AGAIN_JUDGED}` : EXPLORE_AGAIN_INSTRUCTION;
  if (judge) return judgedInstruction(judge);
  return resume.judgement ? REPAIR_INSTRUCTION : INSTRUCTION;
}

/** The entry itself, under a call id of its own. */
export function automationStudioLlmEvidenceResumeEntry(
  resume: AutomationStudioLlmEvidenceLoopResume,
  steps: readonly AutomationStudioFlowDraftStep[]
): { callId: string; toolId: string; value: JsonObject } {
  const value: JsonObject = {
    code: nothingInFlow(resume) ? "llm_evidence_loop.explore_again" : resume.judgement ? "llm_evidence_loop.repair" : "llm_evidence_loop.resumed",
    revision: Number.isSafeInteger(resume.revision) && resume.revision > 0 ? resume.revision : 1,
    stopped: resume.stopped,
    draftSteps: steps.length,
    proposableSteps: steps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
    outstanding: resume.outstandingIssueCodes.filter((code) => /^[a-z0-9_.:-]{1,100}$/iu.test(code)),
    ...(resume.judgement ? { judgement: resume.judgement } : {}),
    instruction: instructionFor(resume)
  };
  return { callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID}.0`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID, value };
}
