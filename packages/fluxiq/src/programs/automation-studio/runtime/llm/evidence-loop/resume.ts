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
// **An unsettled judge's one reading is passed on as exactly that.** When the
// judge's two calls did not settle, but one of them said the Flow does not do
// what was asked, its expected, observed and advice reach the repair as
// `judge.unconfirmedReading`, with words saying the second check did not
// confirm it and to act on it only where the rows bear it out.
//
// **Steps that never ran in this build are named, with the one way through
// (t194-w70).** A re-author or an extend starts from a stored Flow whose steps
// carry nothing they ran with, and Core does not run them itself, so a round
// that stopped with one in its Flow was not tested at all
// (`judgement.notRunInThisBuild`). Live run murwcmx2's re-author (step 0065) was
// told its Flow "was tested from where it starts", reran nothing, and the build
// ended with the advised fix never run from the Flow's start. Now the repair is
// told which steps have not run and, in the words the test's own refusal uses
// (`../../flow-draft/full-run-required.ts`), to rerun each live in the Flow's
// order before completing.
//
// **Core's lines on the rows are said to outrank the judge's advice
// (t274-c25b).** A `no` Core reached over rows a yes passed over carries Core's
// fix lines naming them (`judge.fix`) and its check of the rows the judge named
// against what the test read (`judge.checked`). Live run
// `run-muw60j7c-bb7c9a62`: a judge's advice rested on rows it called left out
// that were in the result, and a repair that got it unmarked followed it. So the
// repair is told what the two are, and that advice resting on a row Core lists
// as in the result is not followed.
//
// Codes, counts and Core's own words, plus the judge's words, which the judge
// screened before they reached the judgement: nothing here is page content
// beyond the row labels the test's reads already screened for the judge
// (`../../result-verification/build-test/read-rows.ts`), so the entry rides
// where every other Core entry does.
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

// The same repair when the round before left a Flow that was not run from its
// start (`judgement.test` is `not_tested`: nothing could replay it, or a budget
// stopped the round). Live run murwcmx2 (re-author step 0065) told such a
// repair its Flow "was tested from where it starts and judged".
const UNTESTED_REPAIR_INSTRUCTION = "This is the repair of a Flow that was not finished when the build stopped (stopped says why). "
  + "What it had was not run from where it starts (judgement.test is not_tested), so nothing here says whether its steps work: judgement says how much of the acts checklist is done. "
  + "Your draft is that Flow. The page is wherever the last round left it, so look first. "
  + "Work live on what is failing or missing, one act or choice at a time, and add each step the Flow needs, naming the act or choice it does (act a2, or a2.quantity). "
  + "Do not repeat work the draft already holds. "
  + "The whole Flow is tested from where it starts when you complete: complete when the Flow does what the instruction asks.";

/** Positive whole positions from a judgement field; none when it holds none. */
function positionsOf(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((position): position is number => Number.isSafeInteger(position) && (position as number) > 0) : [];
}

/** "Step 3", "Steps 1, 2, 4". */
function stepsSaid(positions: readonly number[]): string {
  return positions.length === 1 ? `Step ${positions[0]}` : `Steps ${positions.join(", ")}`;
}

/**
 * The repair of a Flow holding steps carried from the Flow being changed that
 * never ran in this build: which they are, and rerunning each live, in order,
 * as the test's own refusal says (`../../flow-draft/full-run-required.ts`).
 */
function notRunRepairInstruction(positions: readonly number[]): string {
  const one = positions.length === 1;
  return "This is the repair of a Flow that was not finished when the build stopped (stopped says why). "
    + `${stepsSaid(positions)} (judgement.notRunInThisBuild) came from the Flow being changed and ${one ? "has" : "have"} not run in this build (not_run_in_this_build), so the Flow could not be run from where it starts (judgement.test is not_tested) and nothing yet says whether it works. `
    + `The Flow can be tested whole only once ${one ? "it has" : "each of them has"} run in this build: rerun ${one ? "it" : "each"}, in the Flow's order (amend_draft rerun), adding the consequences it would have to its input ([] when it leaves nothing lasting), so it takes its place as a step that ran. `
    + "A rerun of a carried step is first put back where its node started in the run being repaired, where that run recorded it. "
    + "Keep what the draft already changed; rerunning a step with the parameters it has is how it comes to have run. "
    + "Your draft is that Flow. The page is wherever the last round left it, so look first. "
    + "Then complete: the whole Flow is tested from where it starts and judged.";
}

const JUDGED_INSTRUCTION = "The Flow you said was ready was tested from its start and judged against the instruction: judgement.judge says what it did not do (observed), what was asked (expected) and what to change (advice), and findings says why. "
  + "Your draft is that Flow. The page is where the test left it: look first. "
  + "Work live on exactly that: correct or replace the step that does the wrong thing, and add each step the Flow still needs, naming the act or choice it does (act a2, or a2.quantity). "
  + "Do not repeat work the draft already holds. "
  + "The acts checklist is the build's own reading and is information, not the bar: the Flow is judged on what its test does. "
  + "The whole Flow is tested again from where it starts and judged again when you complete: complete when the Flow does what the instruction asks.";

// Not judged to do it: the judge was unsure, could not answer, or its yes was
// about another version of the Flow or about no test at all. A Flow is finished
// only once a run of the whole Flow from its start was judged to do what was
// asked, on the Flow as it stands (user, 2026-10-02, t244).
const UNJUDGED_INSTRUCTION = "The Flow you said was ready was not judged to do what the instruction asks (judgement.judge.findings says why), and a Flow is finished only once a run of the whole Flow from its start is judged to do it. "
  + "Your draft is that Flow. The page is where the test left it: look first. "
  + "Do not repeat work the draft already holds. "
  + "The acts checklist is the build's own reading and is information, not the bar: the Flow is judged on what its test does. "
  + "The whole Flow is tested again from where it starts and judged again when you complete: complete when the Flow does what the instruction asks.";

// Said after the unjudged instruction when one judge call did say the Flow does
// not do what was asked and the other did not confirm it. Until live run
// murwcmx2 that reading was dropped: the repair was told only "not judged" and
// completed the unchanged Flow, though one call had said which condition to
// narrow. It is one reading, not a verdict, so the repair is told to check it
// against the rows rather than to obey it.
const UNCONFIRMED_READING = "judgement.judge.unconfirmedReading is one judge call's reading that the second check did not confirm: what it took the instruction to ask (expected), what it saw the test do (observed) and what it advised changing (advice). "
  + "It is not a verdict: check it against the rows and the test, act on its advice where the rows and the test bear it out, and leave alone what they do not.";

// Said after a judged instruction when the judge's account carries Core's own
// lines on the rows (`judge.fix`, `judge.checked`; t274-c25b).
const CORE_ON_ROWS = "judgement.judge.fix is Core's own fix, naming the condition and each row it left out that the judge passed over, and judgement.judge.checked is Core's check of the rows the judge names against what the test read. "
  + "Where the judge's advice rests on a row Core lists as in the result although the judge calls it left out, that advice is not followed; a condition Core lists as really leaving out a row the instruction wants is the one to correct.";

/** Whether the judge's account carries Core's own lines on the rows. */
function hasCoreOnRows(judge: JsonObject): boolean {
  return [judge.fix, judge.checked].some((lines) => Array.isArray(lines) && lines.length > 0);
}

/** Whether the judge's account carries an unknown's unconfirmed reading. */
function hasUnconfirmedReading(judge: JsonObject): boolean {
  const reading = judge.unconfirmedReading;
  return judge.verdict !== "no" && reading !== null && typeof reading === "object" && !Array.isArray(reading) && Object.keys(reading).length > 0;
}

/** The judge's account in a repair's judgement, when a judge sent the Flow back. */
function judgedBy(resume: AutomationStudioLlmEvidenceLoopResume): JsonObject | undefined {
  const judge = resume.judgement?.judge;
  return judge !== null && typeof judge === "object" && !Array.isArray(judge) ? judge : undefined;
}

/**
 * The repair instruction after a judge: the judged one, then the steps carried
 * from an earlier Flow that its test did not run, to be run again live.
 */
function judgedInstruction(judge: JsonObject, notRun: readonly number[]): string {
  const named = positionsOf(judge.untestedCarried);
  // The judge's account names the carried steps its test did not run; where it names none, the judgement's own reading of the Flow does.
  const carried = named.length ? named : notRun;
  const judged = hasCoreOnRows(judge) ? `${JUDGED_INSTRUCTION} ${CORE_ON_ROWS}` : JUDGED_INSTRUCTION;
  const lead = judge.verdict === "no" ? judged : hasUnconfirmedReading(judge) ? `${UNJUDGED_INSTRUCTION} ${UNCONFIRMED_READING}` : UNJUDGED_INSTRUCTION;
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
  if (nothingInFlow(resume)) {
    if (!judge) return EXPLORE_AGAIN_INSTRUCTION;
    if (hasUnconfirmedReading(judge)) return `${EXPLORE_AGAIN_INSTRUCTION} ${EXPLORE_AGAIN_JUDGED} ${UNCONFIRMED_READING}`;
    return hasCoreOnRows(judge) ? `${EXPLORE_AGAIN_INSTRUCTION} ${EXPLORE_AGAIN_JUDGED} ${CORE_ON_ROWS}` : `${EXPLORE_AGAIN_INSTRUCTION} ${EXPLORE_AGAIN_JUDGED}`;
  }
  const notRun = positionsOf(resume.judgement?.notRunInThisBuild);
  if (judge) return judgedInstruction(judge, notRun);
  if (!resume.judgement) return INSTRUCTION;
  if (notRun.length) return notRunRepairInstruction(notRun);
  return resume.judgement.test === "not_tested" ? UNTESTED_REPAIR_INSTRUCTION : REPAIR_INSTRUCTION;
}

/**
 * Said after a repair's instruction when its judgement names where each step
 * to fix starts (`../../flow-bootstrap/unfinished-build/judgement.ts`,
 * `whereToFix`). Live run `run-muwansvz-a2b4a987` (lane C, R2-4): the repair
 * looked and detected on the page the test left, results page 5, and every
 * paging rerun built on that detect was refused.
 */
const WHERE_TO_FIX = "judgement.whereToFix says where each step to fix starts: look and detect there, not on the page the test left.";

/** The instruction, with the pointer to `whereToFix` when the judgement carries it. */
function withWhereToFix(instruction: string, resume: AutomationStudioLlmEvidenceLoopResume): string {
  const where = resume.judgement?.whereToFix;
  return Array.isArray(where) && where.length ? `${instruction} ${WHERE_TO_FIX}` : instruction;
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
    instruction: withWhereToFix(instructionFor(resume), resume)
  };
  return { callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID}.0`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RESUMED_TOOL_ID, value };
}
