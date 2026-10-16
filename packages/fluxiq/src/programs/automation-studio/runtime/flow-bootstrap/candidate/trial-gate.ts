// The trial gate: the model may finish a candidate only once Core has run that
// exact candidate and the judge said yes for it.
//
// Candidate mode used to end every build on a statically valid draft that
// nothing had run (t330), so "complete" meant only "it parses". The gate puts a
// test between submission and completion. The model asks for a trial of its
// latest submission; an injected port (the service's trial runner, U2 of the
// t339 slice) runs it from the declared start and judges only what that run
// did. The answer is bound to the revision and digest that ran, so:
//
// - a yes for revision 1 says nothing about revision 2, even an identical one;
// - a no closes that exact Flow (by digest): it can be neither tested again nor
//   completed until the model changes it, so a judge cannot be asked until it
//   happens to agree;
// - unsure, not_judged and execution_failed refuse completion with the trial's
//   feedback, and a transient one may be tested again, up to
//   `MAX_TRIALS_PER_REVISION` trials of one revision in all.
//
// **The gate is the one owner of re-testing (t356).** Lane A round 4
// (`run-muyrpbnk-fef374e7`, steps 0048-0050): the second trial of revision 7
// stopped on the page's first-press "Network busy" (`web.action.rate_limited`),
// and the model's identical request to test it again was refused by the loop's
// generic repeat guard (`../../llm/repeat-guard/outcomes.ts`) as "the same call
// failed before", although nothing here forbade it. So a transient verdict
// answers with the reason `retry_allowed`, which the repeat guard reads as "may
// work if made again later" (`../../llm/repeat-guard/retry-later.ts`) and never
// refuses; the bound on re-tests is this gate's, and a re-test past it is
// refused here, by name, with what to do instead.
//
// **The same failure twice ends re-testing (t368, F2).** Lane A round 6
// (`run-muz2cj6p-80eb2179`, trials 1 and 2) re-tested revision 2 after its
// wait timed out, and it timed out again at the same step: the producer calls
// a timeout retryable, but the same step failing the same way in two trials of
// one revision is the Flow, not the page. So when an `execution_failed` trial
// stops at the same step, with the same node and failure code, as an earlier
// trial of the same revision, that revision is not tested again: the answer
// carries no re-test, says to change the step, and a later request to test it
// is refused `candidate.trial_same_failure`. The step is read from the trial's
// feedback, whose `steps` list ends at the step that stopped the run
// (`../../service/candidate-trial/feedback.ts`).
//
// **A control still on the page is tested again (t420).** Paid run R4a
// (`run-mv2nlh9l-52e476da`, 0038) stopped its one trial at a step that could
// not find its control where it was saved, though one like it was on the page. The answer carried `retry_allowed` and the generic "test it
// again if retryable", and the model hunted for a new handle and repeated acts
// on the control instead, until the repeat guard ended the build. When the
// stopping step's feedback says `targetOnPage`
// (`../../service/candidate-trial/target-on-page.ts`), the instruction now
// names the step, says the script need not change, and says to test the same
// revision again first; the verdict stays transient, so that re-test carries
// `retry_allowed` and is never refused as a repeat. If the re-test stops there
// the same way, the same-failure rule above closes the revision, and the
// instruction names the step and says to change it. Neither ever says how a
// control is found, nor asks the model to find or re-address one: that is the
// extension's work (user, 2026-10-10; t426).
//
// **A control on the page but not shown is never tested again unchanged
// (t661).** A8 bigbox cart (`run-mvac0ddx-f52ba929`): the step's control was
// found but hidden -- the menu holding it had been closed again -- and the
// answer said the step was right and to test the same revision again. When the
// stopping step's feedback says `targetNotShown`
// (`../../service/candidate-trial/target-on-page.ts`), the instruction names
// the step, says its control is on the page but not shown, and says to change
// the steps that lead to it so the step that shows it runs right before it;
// never to test unchanged, and never how a control is found.
//
// **A trial the purse cannot judge is no trial (t661, A8 towels debug fix 8).**
// The trial port starts nothing when the purse cannot hold the trial's two
// judge calls (`../../service/candidate-trial/judging-fits.ts`) and answers
// `candidate.trial_unaffordable` with the figures. The gate counts no trial for
// it, keeps no verdict, and refuses with that code and no retry reason, so an
// identical request to test again is the repeat guard's.
//
// **The site is put back first (t462; user, 2026-10-12).** Given a reset
// (`../site-reset/`), a trial that follows a lasting act of this build runs
// only once the model has undone this build's acts and the site is back as the
// build found it, or once refusing would make no progress. A refusal is not a
// trial: it answers `retry_allowed`, so the identical request to test again
// reaches this gate rather than the loop's memory or repeat guard, and it says
// whether taking the target back to the start moved it. The answer of a trial
// that ran says under `startedWith` what was still in place, and under
// `leftOnSite` the acts now on the site, the trial's own among them.
//
// **A start hook runs before the reset check (t475).** When the trial port has
// one (`prepareStart`), it runs first, and the reset is told the site was just
// put back (`startReset`), so every act of this build counts undone and the
// model is asked to undo nothing the hook already undid (t479).
//
// **What a start hook took back is said, never erased (t504).** Lane D round 17
// (`run-mv6lgt3s-c3aa6fac`) pressed one row's control while exploring; the
// hook took that act back and nothing the trial answered or the build kept
// said it had existed. The acts the hook absorbed before a trial are answered
// in that trial's evidence as `absorbedByStartReset`, by what each did and the
// exploration call that made it, and the result this gate keeps for each trial
// (`standing`, the build's record of its trials) carries every act a hook
// absorbed during the build so far, so one absorbed before an earlier
// revision's trial is not lost. Whether the trial is admitted does not change.
//
// **A trial's act keeps where it sat and what it made (t609).** The trial port
// answers each landed act with `spot`, the item and dialog its step's control
// sat in, and `created`, the items its own page showed new, read off the
// step's state diff (`../../service/candidate-trial/landed-acts.ts`, t598).
// This gate copied acts field by field and dropped both, so in candidate mode
// an undo of a trial's act on a site with no start hook was refused
// `candidate.undo_wrong_target` and the act could only be named under
// `cannotUndo`. Both are now copied as a project build's trial path passes
// them, every token held to the declaration's opaque form; a malformed place
// is dropped from its act and the act kept, as it is recorded without one.
//
// **A yes the site asked to slow down completes only once the Flow answers it
// (t485; user, 2026-10).** Lane D round 12 (`run-mv62icw0-070f88ad`, D2): a
// trial passed after the site refused one act and asked the run to slow down,
// the run closed the site's notice by its way out, and the answer said
// "Complete now", so the saved Flow had no step for the notice and no wait. A
// trial met such an interruption when its feedback says the site asked the
// run to slow down: a step's `absorbed` entry carrying the wait the site asked
// for (`askedWaitMs`), a step's `interruptions` entry of kind `rate_limit`, or
// a pace the run learned under `paces`. Other layers the run closed (a consent
// banner, a promotion, a chat panel) asked for no slowing down and do not
// count. The Flow answers it when some node's pace is at least the one asked
// for -- the pace the run learned for that step, else the longest wait the
// site asked -- and, when the notice's way out was named (`wayOut`), when it
// also holds a wait run only after an optional step (the dismiss, its
// `only after:` wait and the join back into the pass), or a handler. A notice
// with no named way out was closed by the run and takes no step
// (`../plan/flow-script-format.ts`), so the pace alone answers it. Until then
// the yes stands, but the answer and the completion rule name what to add,
// under `slowDown`, and completion is refused `candidate.trial_slow_down_unhandled`.
//
// **An unsure says a re-test is allowed, and when it is the better move
// (t632).** A8 wave 8 `run-mv9gbsm5-2957581c` (0051-0054): a revision whose
// rows were exactly right came back unsure, and the builder followed the no's
// advice back to a Flow already judged no, although the trial's own `readings`
// said to test the same revision again where the evidence supports the yes.
// While retests are left, an unsure now says that testing the same revision
// again is allowed and when it is the better move -- one call said yes, Core's
// record contradicts the other call, or that call's advice would take back
// what answered an earlier no; with none left, it says to change the Flow for
// a defect the trial shows.
//
// With no port injected the test tool says `candidate.trial_unavailable` and
// completion keeps its old meaning: the latest valid submission ends as an
// unverified draft, which is all a deployment without a trial runner can make.
// Nothing here promotes; the loop result only carries the standing verdict.
//
// **An exclusion a standing no upheld holds across the build's trials
// (t633).** As the subflow trial gate holds a brief's
// (`../subflow-candidate/subflow-trial-gate.ts`; A8 wave 8
// `run-mv9gbsm5-2957581c`, where a build swung between a Flow keeping a row its
// judges rightly called not the asked kind and one leaving it out, whose nos
// asked to remove the very conditions that left it out). A trial judged no
// hands the gate Core's own record of it (`standingNo`, beside the feedback,
// never shown to a model; `../../result-verification/standing-no/`). A later no
// whose remedy would take back exactly the rows an earlier standing no upheld
// is contradicted by the build's own record: not taken, so the trial is unsure
// and its revision not closed, and the model is told why in Core's words
// (`contradictedByBuild`) and to test the same revision again rather than make
// that change. Never a yes: a yes still needs a trial its judges answer yes.
//
// **A re-test is advised on Core's findings, not on one judge's yes (t641).**
// A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1` (0083): an unsure trial
// split one yes against a right no, the t632 words called a re-test "the better
// move" because one judge call said yes, and the builder spent its last trial
// re-testing a wrong revision, claiming a contradiction Core had not found. An
// unsure now says a re-test is the better move only where Core's record
// contradicts what kept the trial from a yes: the no's reading
// (`unconfirmedReading.recordContradicts` is `whole`, `../../result-verification/agreement.ts`)
// or the unsure call's doubt (`doubtContradicted`); and says which, as a field
// (`retestAdvised`), so the builder cannot claim one Core did not find. Where
// none is, it says a re-test is still allowed, and to change the Flow for the
// defect the reading names where the trial's own evidence shows it.
//
// **And never that nothing contradicts a no Core refutes in part (t652).** A8
// frozen pair 5 candidate towels `run-mva6mlo8-f519063c`, trial 6: a split's no
// claimed a stored row was missing, Core's record refuted that claim, and the
// unsure's words still said "Nothing in Core's record contradicts what kept
// this trial from a yes"; the builder dropped a correct condition on it. Where
// the no's reading carries `recordContradicts: "part"`
// (`../../result-verification/agreement.ts`, now on a split too), the words say
// Core's record contradicts part of it, as its label says, and to change the
// Flow only for what the rest names where the trial's own evidence shows it.
// `retestAdvised` stays false there: only `whole` advises a re-test (t641). A
// trial judged unsure also hands the gate Core's record (`standingNo`), so the
// conditions it keeps come from any judged trial, not only a no.
//
// **And the conditions Core's record showed keep out only what the request
// does not ask for (t641).** The same run dropped, one revision after another,
// two conditions of an exact revision on judges' misread advice. A trial judged
// no hands the gate Core's record of it (`standingNo`), whose conditions now say
// where they stand and, where Core's record accounts for every row one alone
// left out, those rows; the gate finds each such condition as the revision that
// ran wrote it and keeps it (`AutomationStudioResultKeptConditionMemory`). It
// rides on the result the gate keeps for each trial (`keptConditions`, never
// shown to a model), and the submission controller refuses once a later
// revision that drops or changes one (`./submission.ts`).
//
// **A trial on a page the build's exploration changed, and no step does, says
// so (t647; A8 bigbox debug `run-mv9zn5ob-d929084d`, fix 6).** The gap the
// subflow trial gate closes (`../subflow-candidate/subflow-trial-gate.ts`)
// exists here too: a candidate build explores, the start hook takes back what
// its exploration did before each trial, and a Flow with no step for one of
// those acts meets a page the build never explored. Where a trial that is not
// a yes started after the start hook took back an act made while exploring on
// a named control, and no step of this Flow nor any act the trial landed names
// that control, its feedback carries Core's finding under `coreFindings`, code
// `trial.explored_on_absorbed_act` first, naming the act as the act log
// records it (`../site-reset/explored-on-absorbed.ts`). Any exploration of the
// build counts, a project build's every brief's under the supervisor's whole
// trial: the whole Flow is what must do it.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS } from "../plan/index.ts";
import { automationStudioCandidateStartedWithSaid } from "./started-with.ts";
// Its own barrel, not result-verification's, whose reads import flow-bootstrap back (a module cycle).
import {
  AutomationStudioResultKeptConditionMemory,
  AutomationStudioResultStandingNoMemory,
  type AutomationStudioResultKeptConditionsCarrier,
  type AutomationStudioResultStandingNoContradiction
} from "../../result-verification/standing-no/index.ts";
import { automationStudioSiteResetExploredOnAbsorbed, type AutomationStudioSiteResetNamedAct, type AutomationStudioSiteResetSpot, type AutomationStudioSiteResetTrialActPlace, type AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS, type AutomationStudioCandidateTrialAct, type AutomationStudioCandidateTrialPort, type AutomationStudioCandidateTrialResult, type AutomationStudioCandidateTrialVerdict, type AutomationStudioFlowCandidate } from "./contracts.ts";

export const AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID = "core.test_candidate";

/** Trials of one revision and digest, the first included; a transient verdict may be tested again until this many have run. */
export const AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION = 3;

/** The reason a transient verdict carries: the repeat guard never refuses an identical call whose reason says to try again (header). */
const RETEST_REASON = "retry_allowed";

const INSTRUCTIONS: Readonly<Record<AutomationStudioCandidateTrialVerdict, string>> = Object.freeze({
  yes: "The trial passed for this exact revision and digest. Complete now with exactly this revision and digest. Submitting again makes a new revision that needs its own trial.",
  no: "The judge found the trial did not do what the instruction asks. Read the feedback, change the Flow to fix it, submit the whole revised candidate, then test the new revision. This exact Flow cannot be tested again or completed.",
  unsure: "The judge could not confirm the trial did what the instruction asks, and this revision has no retests left, so it cannot complete. Change the Flow for a defect the trial's own reads, steps and stored rows show, submit the whole candidate, then test the new revision.",
  not_judged: "The trial was not judged, so this revision cannot complete. Test this revision again, or change and resubmit it if the feedback names a cause in the Flow.",
  execution_failed: "The candidate did not run to its end, so this revision cannot complete. Read the feedback for the step that failed: what it says happened, and whether trying again may pass (retryable). If it may, test this same revision again; otherwise correct that step, submit the whole candidate, then test the new revision."
});

/**
 * Said for an unsure while the revision may still be tested (header, t632,
 * t641): a re-test is allowed, and the better move only where Core's record
 * contradicts what kept the trial from a yes (`retestAdvised`). Generic words.
 */
const UNSURE_RETEST_ADVISED = "The judge could not confirm the trial did what the instruction asks, so this revision cannot complete yet. "
  + "Core's record contradicts what kept this trial from a yes (retestAdvised is true): the no's reading, which its label in unconfirmedReading says Core's record contradicts, or the doubt doubtContradicted names. "
  + "So testing this same revision again, with the same revision and digest, is the better move (retestsLeft says how many times), and a change that contradicted reading asks for is not. "
  + "Change the Flow only for a defect the trial's own reads, steps and stored rows show, submit the whole candidate, then test the new revision.";
const UNSURE_RETESTABLE = "The judge could not confirm the trial did what the instruction asks, so this revision cannot complete yet. "
  + "Nothing in Core's record contradicts what kept this trial from a yes (retestAdvised is false), so another trial of this same revision is likely to be judged the same way, whatever one judge call said. "
  + "Change the Flow for the defect the no's reading or the doubt names where the trial's own reads, steps and stored rows show it, submit the whole candidate, then test the new revision. "
  + "Testing this same revision again, with the same revision and digest, stays allowed (retestsLeft says how many times) where that evidence shows no such defect.";
/** Said where Core's record contradicts part of the no's reading (header, t652): never that nothing does. Generic words. */
const UNSURE_PART_CONTRADICTED = "The judge could not confirm the trial did what the instruction asks, so this revision cannot complete yet. "
  + "Core's record contradicts part of the no's reading, as its label in unconfirmedReading says (retestAdvised is false): make no change for that part. "
  + "Change the Flow only for what the rest of it names where the trial's own reads, steps and stored rows show it, submit the whole candidate, then test the new revision. "
  + "Testing this same revision again, with the same revision and digest, stays allowed (retestsLeft says how many times) where that evidence shows no such defect.";

/**
 * Said for a no the build's own record contradicts while the revision may
 * still be tested (header, t633): why it is not taken, and to test again
 * rather than make its change. Generic words.
 */
const CONTRADICTED_RETESTABLE = "The judge answered no, but Core's record of this build contradicts that no (contradictedByBuild in the feedback says how): the change it asks for would bring back rows that an earlier no of this build, which stood, called not what the instruction asks for. "
  + "So that no is not taken: this revision is unsure, not closed. Test this same revision again, with the same revision and digest (retestsLeft says how many times), and do not make the change that no asks for. "
  + "Change the Flow only for a defect the trial's own reads, steps and stored rows show, submit the whole candidate, then test the new revision.";

/** The code of a trial the purse could not pay to judge, so it did not start (header, t661). */
const UNAFFORDABLE_CODE = "candidate.trial_unaffordable";

/** What the model is told when a trial did not start because the purse cannot pay its judge calls (header, t661). Generic words. */
const UNAFFORDABLE_INSTRUCTION = "Core did not start this trial: the money this build has left cannot pay the two judge calls that judge a trial, so nothing ran and no judge was asked (notRun has the figures). "
  + "Testing again is refused the same way while that stands, so do not test again, and do not spend calls changing the Flow for a trial that cannot run.";

/** What the model is told when a revision failed the same way twice. */
const SAME_FAILURE_INSTRUCTION = "This revision stopped at the same step with the same failure in two trials, so testing it again would fail the same way. Change that step, or remove it if it only checks the act before it (the judge reads the page the run ends on), submit the whole candidate, then test the new revision.";

/** What the model is told when the step a trial stopped at could not find a control still on the page (header, t420). */
function testAgainInstruction(step: OnPageStep): string {
  return `${named(step)} could not find its control where it was saved, though one like it is on the page. Nothing in your script needs to change for this: test this same revision again, with the same revision and digest, without acting on the control yourself.`;
}

/** What the model is told when the step a trial stopped at found its control on the page but not shown (header, t661). */
function notShownInstruction(step: OnPageStep, resubmit: string): string {
  return `${named(step)} found its control on the page, but the control was not shown, so the step could not use it. Testing this revision unchanged would meet the same hidden control. `
    + "A step before it must show it: put the step that opens the menu, panel or list holding the control right before this step, with nothing between them that could close it again, or add that step where the Flow has none. "
    + `Change the steps that lead to this one, not how this step finds its control, ${resubmit}, then test the new revision.`;
}

/** What the model is told when that happened at the same step in two trials of one revision (header, t420). */
function stillNotFoundInstruction(step: OnPageStep): string {
  return `${named(step)} could not find its control where it was saved in two trials, though one like it was on the page both times, so testing this revision again would fail the same way. Do not repeat acts on that control. Change that step, or the steps that lead to it, submit the whole candidate, then test the new revision.`;
}

/** The nodes a Flow answers a slow-down with (header): a wait, and the join an optional step's way past meets at. */
const WAIT_NODE_ID = "builtin.timing.wait";
const MERGE_NODE_ID = "builtin.control.merge";

/** What the model is told when a passed trial met a slow-down the Flow does not answer yet (header). */
function slowDownInstruction(unhandled: readonly JsonObject[]): string {
  const said = unhandled.map((entry) => {
    const needs: string[] = [];
    if (typeof entry.paceAtLeastMs === "number") needs.push(`\`repeat pace:\` of at least ${seconds(entry.paceAtLeastMs)} on the first step of the span it repeats in`);
    if (typeof entry.wayOut === "string" && typeof entry.waitAtLeastMs === "number") {
      needs.push(`right after it, inside the span, an \`optional: yes\` step that presses ${entry.wayOut}, and directly after that a \`builtin.timing.wait\` step with \`only after:\` naming it that waits at least ${seconds(entry.waitAtLeastMs)}, so a pass that meets the notice dismisses it, waits and goes on with the loop (or one handler covering the step that does the same)`);
    }
    const label = typeof entry.label === "string" ? ` (${JSON.stringify(entry.label)})` : "";
    return `${typeof entry.step === "number" ? `Step ${entry.step}` : "A step"}${label} needs ${needs.join(", and ")}.`;
  });
  return `The trial passed, but the site asked the run to slow down, and this Flow does not answer that itself yet, so this revision cannot complete. ${said.join(" ")} Change the Flow, submit the whole candidate, then test the new revision, and complete only after a yes for it.`;
}

/** Verdicts after which the same revision may be tested again, within the bound. */
const TRANSIENT: ReadonlySet<AutomationStudioCandidateTrialVerdict> = new Set(["unsure", "not_judged", "execution_failed"]);

/** The model-facing test tool and the completion rule bound to its verdicts. */
export class AutomationStudioFlowCandidateTrialGate {
  readonly tool: AutomationStudioLlmEvidenceTool = {
    toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, effect: "mutate",
    description: "Ask Core to run your latest submitted candidate once, on its own with no model, from its declared start, and to judge only what that run did. Give that candidate's revision and digest exactly. The answer is a verdict (yes, no, unsure, not_judged or execution_failed) with feedback. The run acts on the site like the saved Flow would. Before a trial, put the site back the way this build found it: if this answers candidate.trial_reset_required, undo the acts it lists, then test again; an act the site offers no control to undo goes under cannotUndo, and the trial runs with it already done. Complete only after a yes for that exact revision and digest; any later submission needs its own trial. After a no, change the Flow and submit it before testing again. If it answers candidate.trial_unavailable, no trial can run here: complete with the latest revision and digest and the Flow stays an unverified draft.",
    inputSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" },
      cannotUndo: { type: "array", maxItems: 50, items: { type: "string", pattern: "^act-[1-9][0-9]{0,3}$" }, description: "Only after candidate.trial_reset_required listed them: the acts the site offers no control to undo. The trial then runs with them already done, and the judge is told." } },
    required: ["revision", "digest"], additionalProperties: false }
  };
  /** Each trial's answer as kept, with the kept conditions as of that trial (header, t641): what `standing` hands the submission controller. */
  private readonly verdicts = new Map<string, AutomationStudioCandidateTrialResult & AutomationStudioResultKeptConditionsCarrier>();
  private readonly closedDigests = new Map<string, JsonObject>();
  /** Trials run of each revision and digest. */
  private readonly trials = new Map<string, number>();
  /** The steps the `execution_failed` trials of each revision and digest stopped at. */
  private readonly stoppedAt = new Map<string, Set<string>>();
  /** Revisions that stopped at the same step twice, with that step: they are not tested again. */
  private readonly repeatedFailures = new Map<string, JsonObject>();
  /** What each passed revision met that its Flow does not answer yet (header); absent when nothing. */
  private readonly slowDowns = new Map<string, JsonObject[]>();
  /** Every act of this build a start hook took back so far, in the order it was absorbed (header, t504). */
  private readonly absorbed: AutomationStudioSiteResetNamedAct[] = [];
  /** The build's standing nos that upheld rows of a kind, for a later no to be held to (header, t633). */
  private readonly standingNos = new AutomationStudioResultStandingNoMemory();
  /** The conditions Core's record showed keep out only rows the request does not ask for (header, t641). */
  private readonly keptConditions = new AutomationStudioResultKeptConditionMemory();
  private readonly fallbackSignal = new AbortController().signal;

  constructor(private readonly input: {
    latest: () => AutomationStudioFlowCandidate | undefined;
    trial?: { candidateId: string; port: AutomationStudioCandidateTrialPort } | undefined;
    signal?: AbortSignal | undefined;
    /** The site reset before each trial (header); absent, a trial runs on the site as it stands. */
    reset?: AutomationStudioSiteResetTrialReset | undefined;
  }) {
    if (input.trial && (typeof input.trial.candidateId !== "string" || !input.trial.candidateId || typeof input.trial.port !== "function")) throw new Error("candidate.trial_port_invalid");
  }

  /** Whether a trial can run here; without one, completion stays the draft-only completion it was. */
  get available(): boolean { return this.input.trial !== undefined; }

  async test(value: JsonObject, callSignal?: AbortSignal): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const revision = value.revision, digest = value.digest;
    const cannotUndo = value.cannotUndo;
    if (!Number.isSafeInteger(revision) || typeof digest !== "string" || Object.keys(value).some((key) => key !== "revision" && key !== "digest" && key !== "cannotUndo")
      || (cannotUndo !== undefined && !(Array.isArray(cannotUndo) && cannotUndo.length <= 50 && cannotUndo.every((act) => typeof act === "string")))) {
      return refused("candidate.trial_input_invalid", "Call core.test_candidate with exactly the latest submission's revision (an integer) and digest (a string), as core.submit_candidate returned them, and optionally cannotUndo: the act ids a reset listed that the site cannot undo.");
    }
    const trial = this.input.trial;
    if (!trial) return refused("candidate.trial_unavailable", "No trial runner is available here. Complete with the latest revision and digest; the Flow stays an unverified draft.");
    const latest = this.input.latest();
    if (!latest) return refused("candidate.trial_stale_revision", "There is no valid latest candidate to test. Submit a complete candidate with core.submit_candidate, then test the revision and digest it returns.");
    if (latest.revision !== revision || latest.digest !== digest) {
      return refused("candidate.trial_stale_revision", "Only the latest submitted candidate can be tested. Test the revision and digest given here.", { latestRevision: latest.revision, latestDigest: latest.digest });
    }
    const closed = this.closedDigests.get(latest.digest);
    if (closed) return refused("candidate.trial_unchanged_after_no", "This exact Flow was already tried and judged no. Change it to address that feedback, submit it, then test the new revision.", { previousFeedback: closed });
    const repeated = this.repeatedFailures.get(key(latest));
    if (repeated) return refused("candidate.trial_same_failure", repeatedInstruction(this.verdicts.get(key(latest))), { failedStep: repeated, ...(this.verdicts.get(key(latest)) ? { previousFeedback: this.verdicts.get(key(latest))!.feedback } : {}) });
    const tried = this.trials.get(key(latest)) ?? 0;
    if (tried >= AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION) {
      return refused("candidate.trial_retest_limit", `This exact revision has been tested ${tried} times without a yes, so it is not tested again. Read the last trial's feedback, change the step it names (or the Flow), submit the whole candidate, then test the new revision.`,
        { trials: tried, maxTrials: AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION, ...(this.verdicts.get(key(latest)) ? { previousFeedback: this.verdicts.get(key(latest))!.feedback } : {}) });
    }
    const signal = callSignal ?? this.input.signal ?? this.fallbackSignal;
    signal.throwIfAborted();
    // The deployment's start hook first, so the check after it finds the site put back (header).
    const prepared = this.input.reset && trial.port.prepareStart ? await trial.port.prepareStart({ revision: latest.revision, digest: latest.digest, signal }) : "none";
    signal.throwIfAborted();
    const reset = await this.input.reset?.beforeTrial(signal, Array.isArray(cannotUndo) ? cannotUndo as string[] : undefined, prepared === "reset" ? { startReset: true } : undefined);
    signal.throwIfAborted();
    // Not a trial: the model is told what to put back, and the identical test after it reaches this gate again (header).
    if (reset?.kind === "refuse") return { kind: "llm_evidence_tool_execution", evidence: reset.evidence, effectApplied: reset.moved, targetsUnchanged: !reset.moved, resultCode: reset.evidence.code, resultReason: RETEST_REASON };
    // What the hook took back before this trial is recorded at once, whatever the trial then answers (header, t504).
    const absorbedActs = reset?.kind === "admit" ? reset.absorbedByStartReset ?? [] : [];
    const absorbed = absorbedActs.map(namedAct);
    this.absorbed.push(...absorbed);
    this.trials.set(key(latest), tried + 1);
    const asked = await this.ask(trial, latest, signal, reset?.kind === "admit" ? automationStudioCandidateStartedWithSaid(reset.startedWith) : []);
    signal.throwIfAborted();
    // Not a trial: the purse could not pay its two judge calls, so nothing ran and nothing is counted (header, t661).
    if (asked.answer.feedback.code === UNAFFORDABLE_CODE) {
      this.trials.set(key(latest), tried);
      return refused(UNAFFORDABLE_CODE, UNAFFORDABLE_INSTRUCTION, { notRun: asked.answer.feedback });
    }
    // A no whose remedy would take back what an earlier standing no of this build upheld is not taken (header, t633).
    const contradiction = this.standingNos.weigh({ revision: asked.answer.revision, verdict: asked.answer.verdict, standingNo: asked.standingNo });
    const weighedAnswer = contradiction ? notTaken(asked.answer, contradiction) : asked.answer;
    // The page the build explored was changed by an act the start took back and no step does (header, t647).
    const explored = weighedAnswer.verdict !== "yes"
      ? automationStudioSiteResetExploredOnAbsorbed({ absorbed: absorbedActs, steps: (latest.buildPlan?.plan?.subflows ?? []).flatMap((subflow) => subflow.nodes ?? []), ran: weighedAnswer.acts, whose: "flow" })
      : [];
    const answer = explored.length ? withCoreFindings(weighedAnswer, explored) : weighedAnswer;
    // What Core's record of this trial shows its conditions kept out, as the revision that ran wrote them (header, t641).
    this.keptConditions.remember({ revision: answer.revision, standingNo: asked.standingNo, plan: latest.buildPlan?.plan });
    const keptConditions = this.keptConditions.conditions();
    const leftOnSite = this.input.reset?.trialRan(answer.acts ?? [], answer.trialRunId);
    this.verdicts.set(key(answer), {
      ...answer,
      ...(this.absorbed.length > 0 ? { absorbedByStartReset: this.absorbed.map(namedAct) } : {}),
      ...(keptConditions.length ? { keptConditions } : {})
    });
    if (answer.verdict === "no") this.closedDigests.set(answer.digest, answer.feedback);
    const repeatedStep = this.recordStop(answer);
    const slowDown = answer.verdict === "yes" ? unhandledSlowDowns(answer.feedback, latest) : [];
    if (slowDown.length) this.slowDowns.set(key(answer), slowDown);
    const retestsLeft = TRANSIENT.has(answer.verdict) && !repeatedStep ? AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION - (tried + 1) : 0;
    const evidence: JsonObject = {
      ok: answer.verdict === "yes", verdict: answer.verdict, revision: answer.revision, digest: answer.digest,
      ...(answer.trialRunId ? { trialRunId: answer.trialRunId } : {}), feedback: answer.feedback,
      instruction: repeatedStep ? repeatedInstruction(answer) : slowDown.length ? slowDownInstruction(slowDown) : standingInstruction(answer, retestsLeft > 0),
      ...(repeatedStep ? { failedStep: repeatedStep } : {}),
      ...(slowDown.length ? { slowDown } : {}),
      ...(TRANSIENT.has(answer.verdict) ? { retestsLeft } : {}),
      // Whether Core's record contradicts what kept an unsure from a yes: the fact its instruction rests on (header, t641).
      ...(answer.verdict === "unsure" && retestsLeft > 0 && typeof answer.feedback.contradictedByBuild !== "string" ? { retestAdvised: automationStudioCandidateRetestAdvised(answer) } : {}),
      ...(reset?.kind === "admit" && reset.startedWith ? { startedWith: reset.startedWith } : {}),
      ...(absorbed.length ? { absorbedByStartReset: absorbed } : {}),
      ...(leftOnSite?.length ? { leftOnSite: leftOnSite.map(namedAct) } : {})
    };
    // The trial ran on the target, so whatever it touched may have moved. A transient verdict with a re-test left says
    // so in its reason, so the identical request to test again is never refused as a repeat (header).
    return { kind: "llm_evidence_tool_execution", evidence, effectApplied: true, targetsUnchanged: false, resultCode: `candidate.trial_${answer.verdict}`, ...(retestsLeft > 0 ? { resultReason: RETEST_REASON } : {}) };
  }

  /** The completion rule, asked only once the receipt names the latest valid submission. */
  completion(receipt: { revision: number; digest: string }): AutomationStudioLlmEvidenceCompletionCheck {
    if (!this.input.trial) return { ok: true };
    const answer = this.verdicts.get(key(receipt));
    const slowDown = this.slowDowns.get(key(receipt));
    if (answer?.verdict === "yes" && slowDown) return refusal("candidate.trial_slow_down_unhandled", slowDownInstruction(slowDown), { verdict: answer.verdict, slowDown });
    if (answer?.verdict === "yes") return { ok: true };
    const closed = this.closedDigests.get(receipt.digest);
    if (closed) return refusal("candidate.trial_unchanged_after_no", "This exact Flow was judged no and has not changed. Change it to address that feedback, submit it, test the new revision, and complete only after a yes.", { previousFeedback: closed });
    const repeated = this.repeatedFailures.get(key(receipt));
    if (answer && repeated) return refusal(`candidate.trial_${answer.verdict}`, repeatedInstruction(answer), { verdict: answer.verdict, failedStep: repeated, trialFeedback: answer.feedback });
    if (!answer) return refusal("candidate.trial_required", `Test this candidate first: call ${AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID} with revision ${receipt.revision} and digest ${receipt.digest}, and complete only after it answers yes for that revision and digest.`);
    const retestable = TRANSIENT.has(answer.verdict) && (this.trials.get(key(receipt)) ?? 0) < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION;
    const advised = answer.verdict === "unsure" && retestable && typeof answer.feedback.contradictedByBuild !== "string" ? { retestAdvised: automationStudioCandidateRetestAdvised(answer) } : {};
    return refusal(`candidate.trial_${answer.verdict}`, standingInstruction(answer, retestable), { verdict: answer.verdict, trialFeedback: answer.feedback, ...advised });
  }

  /**
   * Records the step an `execution_failed` trial stopped at, and answers that
   * step when an earlier trial of the same revision stopped at it too, which
   * closes the revision to re-testing (header).
   */
  private recordStop(answer: AutomationStudioCandidateTrialResult): JsonObject | undefined {
    if (answer.verdict !== "execution_failed") return undefined;
    const step = stoppingStep(answer.feedback);
    if (!step) return undefined;
    const signature = JSON.stringify(step);
    const seen = this.stoppedAt.get(key(answer)) ?? new Set<string>();
    const repeated = seen.has(signature);
    seen.add(signature);
    this.stoppedAt.set(key(answer), seen);
    if (!repeated) return undefined;
    this.repeatedFailures.set(key(answer), step);
    return step;
  }

  /**
   * Whether the latest submission may be tested now, for a stall to run that
   * test instead of ending the build (`./stall-retest.ts`, t477): its revision,
   * digest and the trials run of it so far, or why not -- the code the build's
   * ending carries. A yes needs no test: the model completes on it.
   */
  retestable(): { revision: number; digest: string; trials: number } | { why: string } {
    if (!this.input.trial) return { why: "candidate.stall_no_trial_runner" };
    const latest = this.input.latest();
    if (!latest) return { why: "candidate.stall_nothing_submitted" };
    if (this.closedDigests.has(latest.digest)) return { why: "candidate.stall_latest_judged_no" };
    if (this.repeatedFailures.has(key(latest))) return { why: "candidate.stall_latest_failed_twice" };
    if (this.verdicts.get(key(latest))?.verdict === "yes") return { why: "candidate.stall_latest_passed" };
    const trials = this.trials.get(key(latest)) ?? 0;
    if (trials >= AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION) return { why: "candidate.stall_retests_used" };
    return { revision: latest.revision, digest: latest.digest, trials };
  }

  /** The judge's feedback when a trial of a Flow with this digest was judged no, which closes that Flow (header); undefined otherwise. */
  refuted(digest: string): JsonObject | undefined {
    const closed = this.closedDigests.get(digest);
    return closed ? structuredClone(closed) : undefined;
  }

  /** The verdict standing for this candidate, when it was tried; undefined for an untested candidate. */
  standing(candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest"> | undefined): AutomationStudioCandidateTrialResult | undefined {
    const answer = candidate ? this.verdicts.get(key(candidate)) : undefined;
    return answer ? structuredClone(answer) : undefined;
  }

  /** The trial's answer as the gate keeps it, and Core's record of a no it carried beside it, unread (header, t633). */
  private async ask(trial: { candidateId: string; port: AutomationStudioCandidateTrialPort }, latest: AutomationStudioFlowCandidate, signal: AbortSignal, startedWith: readonly string[]): Promise<{ answer: AutomationStudioCandidateTrialResult; standingNo?: unknown }> {
    const failed = (code: string): { answer: AutomationStudioCandidateTrialResult } => ({ answer: { revision: latest.revision, digest: latest.digest, verdict: "execution_failed", feedback: { code } } });
    let raw: unknown;
    try {
      raw = await trial.port({ candidateId: trial.candidateId, revision: latest.revision, digest: latest.digest, signal, candidate: deepFreeze(structuredClone(latest)), ...(startedWith.length ? { startedWith: [...startedWith] } : {}) });
    } catch (error) {
      if (signal.aborted) throw error;
      // The port's own error text may carry page or account detail, so the model is told only that it failed.
      return failed("candidate.trial_port_failed");
    }
    const result = raw as Partial<AutomationStudioCandidateTrialResult> | null;
    if (!result || typeof result !== "object" || Array.isArray(result)
      || !(AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS as readonly unknown[]).includes(result.verdict)
      || !isJsonObject(result.feedback) || (result.trialRunId !== undefined && typeof result.trialRunId !== "string")) return failed("candidate.trial_result_invalid");
    // A verdict about another revision or digest is no verdict about this one.
    if (result.revision !== latest.revision || result.digest !== latest.digest) return failed("candidate.trial_result_mismatch");
    const acts = trialActs(result.acts);
    const answer: AutomationStudioCandidateTrialResult = { revision: latest.revision, digest: latest.digest, verdict: result.verdict!, feedback: structuredClone(result.feedback) as JsonObject, ...(result.trialRunId ? { trialRunId: result.trialRunId } : {}), ...(acts.length ? { acts } : {}) };
    const standingNo = (result as { standingNo?: unknown }).standingNo;
    return { answer, ...(standingNo !== undefined ? { standingNo } : {}) };
  }
}

/** A trial's lasting acts, copied with where each sat and what it made (header, t609); a malformed entry is dropped rather than refusing the verdict it rides on. */
function trialActs(value: unknown): Array<AutomationStudioCandidateTrialAct & AutomationStudioSiteResetTrialActPlace> {
  if (!Array.isArray(value)) return [];
  const known = new Set<unknown>(AUTOMATION_STUDIO_ACTION_CONSEQUENCES);
  return value.flatMap((entry): Array<AutomationStudioCandidateTrialAct & AutomationStudioSiteResetTrialActPlace> => {
    if (!isJsonObject(entry) || typeof entry.step !== "number" || !Number.isSafeInteger(entry.step) || typeof entry.definitionId !== "string" || !entry.definitionId) return [];
    if (!Array.isArray(entry.consequences) || !entry.consequences.length || !entry.consequences.every((consequence) => known.has(consequence))) return [];
    if ((entry.label !== undefined && typeof entry.label !== "string") || (entry.control !== undefined && typeof entry.control !== "string")) return [];
    const spot = spotOf(entry.spot), created = createdOf(entry.created);
    return [{ step: entry.step, definitionId: entry.definitionId, ...(entry.label ? { label: entry.label } : {}), ...(entry.control ? { control: entry.control } : {}), consequences: [...new Set(entry.consequences as AutomationStudioCandidateTrialAct["consequences"])], ...(spot ? { spot } : {}), ...(created ? { created } : {}) }];
  });
}

/** An opaque place token, in the form a declaration's `control.item` takes (`../../action-permissions/declaration.ts`). */
const PLACE_TOKEN = /^[A-Za-z0-9:_-]{1,128}$/u;
/** More items than any page lists is no list of what a step made. */
const MAX_CREATED = 2_000;

function placeToken(value: unknown): string | undefined {
  return typeof value === "string" && PLACE_TOKEN.test(value) ? value : undefined;
}

/** A trial act's `spot`, where it names an item or a dialog by token (header). */
function spotOf(value: unknown): AutomationStudioSiteResetSpot | undefined {
  if (!isJsonObject(value)) return undefined;
  const item = placeToken(value.item), dialog = placeToken(value.dialog);
  return item || dialog ? { ...(item ? { item } : {}), ...(dialog ? { dialog } : {}) } : undefined;
}

/** A trial act's `created`: every entry a token, or none of it (header). */
function createdOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > MAX_CREATED) return undefined;
  const read = value.map(placeToken);
  return read.every((token): token is string => token !== undefined) ? [...new Set(read)] : undefined;
}

/** One act of the build as a trial's answer names it: its id, what it did, and the exploration call that made it; never what the reset last saw of it. */
function namedAct(act: AutomationStudioSiteResetNamedAct): { act: string; did: string; call?: string } {
  return { act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}) };
}

function key(receipt: { revision: number; digest: string }): string { return `${receipt.revision}\n${receipt.digest}`; }

/** The answer with Core's own findings beside the trial's feedback, after any already there (header, t647). */
function withCoreFindings(answer: AutomationStudioCandidateTrialResult, found: readonly JsonObject[]): AutomationStudioCandidateTrialResult {
  const earlier = Array.isArray(answer.feedback.coreFindings) ? answer.feedback.coreFindings : [];
  return { ...answer, feedback: { ...answer.feedback, coreFindings: [...earlier, ...found] } };
}

/** A no the build's own record contradicts, kept as an unsure with Core's words beside the judge's (header, t633): its revision is not closed. */
function notTaken(answer: AutomationStudioCandidateTrialResult, contradiction: AutomationStudioResultStandingNoContradiction): AutomationStudioCandidateTrialResult {
  return { ...answer, verdict: "unsure", feedback: { ...answer.feedback, contradictedByBuild: contradiction.said } };
}

/**
 * The step a failed trial stopped at, from its feedback: the last step listed,
 * when it failed, by its position, node and failure code, with the run's code.
 * Nothing when the feedback lists no failed last step (a start that failed, a
 * port that failed, a run that stopped between steps).
 */
function stoppingStep(feedback: JsonObject): JsonObject | undefined {
  const steps = feedback.steps;
  const last = Array.isArray(steps) ? steps.at(-1) : undefined;
  if (!isJsonObject(last) || last.status !== "failed" || typeof last.step !== "number" || !Number.isSafeInteger(last.step) || typeof last.definitionId !== "string") return undefined;
  return {
    step: last.step, definitionId: last.definitionId,
    ...(typeof last.failureCode === "string" ? { failureCode: last.failureCode } : {}),
    ...(typeof feedback.code === "string" ? { code: feedback.code } : {})
  };
}

/** The step a failed trial stopped at when it could not find a control still on the page (`targetOnPage`, header). */
type OnPageStep = { step: number; label?: string };

function onPageStep(answer: Pick<AutomationStudioCandidateTrialResult, "verdict" | "feedback"> | undefined, flag: "targetOnPage" | "targetNotShown" = "targetOnPage"): OnPageStep | undefined {
  if (answer?.verdict !== "execution_failed") return undefined;
  const steps = answer.feedback.steps;
  const last = Array.isArray(steps) ? steps.at(-1) : undefined;
  if (!isJsonObject(last) || last.status !== "failed" || last[flag] !== true || typeof last.step !== "number" || !Number.isSafeInteger(last.step)) return undefined;
  return { step: last.step, ...(typeof last.label === "string" && last.label.trim() ? { label: last.label.replace(/\s+/gu, " ").trim().slice(0, 80) } : {}) };
}

/**
 * The instruction for a trial that stopped at a step whose control was on the
 * page but not shown (header, t661), or nothing for any other answer. Exported
 * for the subflow trial gate, which says the same.
 */
export function automationStudioCandidateNotShownInstruction(answer: Pick<AutomationStudioCandidateTrialResult, "verdict" | "feedback"> | undefined, resubmit = "submit the whole candidate"): string | undefined {
  const step = onPageStep(answer, "targetNotShown");
  return step ? notShownInstruction(step, resubmit) : undefined;
}

/** The step as the instructions name it: its number in the trial's feedback, and its own label when it has one. */
function named(step: OnPageStep): string {
  return `Step ${step.step}${step.label ? ` (${JSON.stringify(step.label)})` : ""}`;
}

/** What a verdict tells the model to do, when its revision has not failed the same way twice. */
function standingInstruction(answer: AutomationStudioCandidateTrialResult, retestable: boolean): string {
  const notShown = automationStudioCandidateNotShownInstruction(answer);
  if (notShown) return notShown;
  const onPage = retestable ? onPageStep(answer) : undefined;
  if (onPage) return testAgainInstruction(onPage);
  if (answer.verdict === "unsure" && retestable && typeof answer.feedback.contradictedByBuild === "string") return CONTRADICTED_RETESTABLE;
  if (answer.verdict === "unsure" && retestable) {
    if (automationStudioCandidateRetestAdvised(answer)) return UNSURE_RETEST_ADVISED;
    return automationStudioCandidateRecordContradictsPart(answer) ? UNSURE_PART_CONTRADICTED : UNSURE_RETESTABLE;
  }
  return INSTRUCTIONS[answer.verdict];
}

/**
 * Whether Core's record contradicts part, and not all, of the no's reading
 * that kept an unsure from a yes (header, t652): `unconfirmedReading.recordContradicts`
 * is `part`, the field Core set beside its label. Never a reason to re-test
 * (`automationStudioCandidateRetestAdvised`); only that the unsure's words never
 * say nothing in Core's record contradicts it. Exported for the subflow trial
 * gate and the unchanged-submission refusal, which say the same.
 */
export function automationStudioCandidateRecordContradictsPart(answer: { feedback: JsonObject }): boolean {
  const reading = answer.feedback.unconfirmedReading;
  return isJsonObject(reading) && reading.recordContradicts === "part";
}

/**
 * Whether Core's record contradicts what kept an unsure from a yes (header,
 * t641): the no's reading wholly (`unconfirmedReading.recordContradicts`, Core's
 * field beside its label), or the unsure call's doubt (`doubtContradicted`).
 * Read as fields Core set, never off the words; one judge's yes is none.
 * Exported for the subflow trial gate, which advises a re-test the same way.
 */
export function automationStudioCandidateRetestAdvised(answer: { feedback: JsonObject }): boolean {
  const reading = answer.feedback.unconfirmedReading;
  if (isJsonObject(reading) && reading.recordContradicts === "whole") return true;
  return typeof answer.feedback.doubtContradicted === "string" && answer.feedback.doubtContradicted.length > 0;
}

/** What the model is told once a revision stopped at the same step twice, from the latest trial of it. */
function repeatedInstruction(answer: AutomationStudioCandidateTrialResult | undefined): string {
  const notShown = automationStudioCandidateNotShownInstruction(answer);
  if (notShown) return notShown;
  const onPage = onPageStep(answer);
  return onPage ? stillNotFoundInstruction(onPage) : SAME_FAILURE_INSTRUCTION;
}

/** One step a trial listed, with the paces the run learned for it; a learned pace whose step is not listed stands alone. */
type SteppedPaces = JsonObject & { learned: JsonObject[] };

/**
 * Each step of a passed trial the site asked to slow down that the Flow does
 * not answer yet (header): its number and label, `paceAtLeastMs` when no
 * node's pace reaches the one asked, and `wayOut` with `waitAtLeastMs` when the
 * notice's way out was named and the Flow holds neither a wait after an
 * optional step nor a handler.
 */
function unhandledSlowDowns(feedback: JsonObject, candidate: AutomationStudioFlowCandidate): JsonObject[] {
  const steps = objects(feedback.steps);
  const paces = objects(feedback.paces);
  const metSlowDown = paces.length > 0 || steps.some((step) => objects(step.absorbed).some((entry) => positive(entry.askedWaitMs)) || objects(step.interruptions).some((layer) => layer.kind === "rate_limit"));
  // A trial that met none is a plain yes, and its plan is not read.
  if (!metSlowDown) return [];
  const subflows = candidate.buildPlan.plan.subflows;
  const longestPace = Math.max(0, ...subflows.flatMap((subflow) => subflow.nodes.map((node) => node.paceMs ?? 0)));
  const dismissesAndWaits = subflows.some((subflow) => waitAfterOptional(subflow) || subflow.nodes.some((node) => node.definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler));
  const sameStep = (pace: JsonObject, step: JsonObject) => pace.definitionId === step.definitionId && pace.label === step.label && pace.control === step.control;
  const listed: SteppedPaces[] = steps.map((step) => ({ ...step, learned: paces.filter((pace) => sameStep(pace, step)) }));
  const alone: SteppedPaces[] = paces.filter((pace) => !steps.some((step) => sameStep(pace, step))).map((pace) => ({ ...(typeof pace.label === "string" ? { label: pace.label } : {}), learned: [pace] }));
  return [...listed, ...alone].flatMap((step): JsonObject[] => {
    const asked = objects(step.absorbed).map((entry) => entry.askedWaitMs).filter(positive);
    const learned = step.learned.map((pace) => pace.paceMs).filter(positive);
    const wayOut = objects(step.interruptions).filter((layer) => layer.kind === "rate_limit").map((layer) => layer.wayOut).find((handle): handle is string => typeof handle === "string" && handle !== "");
    const paceAtLeastMs = Math.max(0, ...(learned.length ? learned : asked));
    const needsPace = paceAtLeastMs > 0 && longestPace < Math.floor(paceAtLeastMs / 100) * 100;
    const needsBranch = wayOut !== undefined && !dismissesAndWaits;
    if (!needsPace && !needsBranch) return [];
    const waitAtLeastMs = Math.max(0, ...asked) || paceAtLeastMs;
    return [{
      ...(typeof step.step === "number" ? { step: step.step } : {}),
      ...(typeof step.label === "string" ? { label: step.label } : {}),
      ...(needsPace ? { paceAtLeastMs } : {}),
      ...(needsBranch ? { wayOut, waitAtLeastMs } : {})
    }];
  });
}

/** Whether a subflow holds a wait run only after an optional step: one that follows a step whose way past joins the pass again. */
function waitAfterOptional(subflow: AutomationStudioFlowCandidate["buildPlan"]["plan"]["subflows"][number]): boolean {
  const byKey = new Map(subflow.nodes.map((node) => [node.key, node]));
  const optional = new Set(subflow.edges.filter((edge) => edge.source.portId === "failed" && byKey.get(edge.target.nodeKey)?.definitionId === MERGE_NODE_ID).map((edge) => edge.source.nodeKey));
  return subflow.edges.some((edge) => optional.has(edge.source.nodeKey) && edge.source.portId !== "failed" && byKey.get(edge.target.nodeKey)?.definitionId === WAIT_NODE_ID);
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** A wait as the model reads it, in seconds rounded up to a tenth, so writing the number said is always enough. */
function seconds(ms: number): string {
  return `${(Math.ceil(ms / 100) / 10).toFixed(1)} s`;
}

function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, instruction, ...detail }, effectApplied: false, targetsUnchanged: true, resultCode: code };
}

function refusal(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction, ...detail } };
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try { return JSON.stringify(value) !== undefined; } catch { return false; }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const entry of Object.values(value)) deepFreeze(entry); Object.freeze(value); }
  return value;
}
