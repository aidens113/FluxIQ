// The subflow trial gate: a builder may finish its brief only once Core has
// tried that exact proposal of its subflow and the judge said yes for it
// (automation-project-agents-plan.md, `Subflow trial`).
//
// It asks an injected `AutomationStudioSubflowTrialPort` (the validator's
// partial entry, t538): prepare the brief's entry, run the proposal's subflow
// with its interface inputs, judge the brief's parts and the subflow's success
// check. Its verdicts are partial and kept here, apart from the whole-candidate
// gate (`../candidate/trial-gate.ts`), by type and by owner: a partial yes is
// never a whole candidate's trial, so it can never satisfy that gate's
// completion, which the supervisor's judged whole run alone does.
//
// The rules the whole gate learned hold here too, with this gate's own codes:
// the answer is bound to the revision and digest that ran; a no closes that
// exact proposal; a transient verdict may be tried again up to
// `AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION` trials in all, and says
// `retry_allowed` so the loop's repeat guard leaves the bound to this gate. A
// trial whose entry was not prepared (a predecessor did not run to its end)
// says so: its verdict is about the predecessors, not this subflow.
//
// **The site is put back first, as the whole gate puts it back** (t578; user,
// 2026-10-12; A8 bigbox debug, fix 2). Given a reset (`../site-reset/`, the
// brief's own ledger and start check), a trial runs only once this build's
// lasting acts are undone, by the same ledger and policy the whole-candidate
// gate asks (`../candidate/trial-gate.ts`): a refusal is not a trial, answers
// `retry_allowed`, and names the acts to undo; an act the site cannot undo
// goes under `cannotUndo` and the trial runs with it, the judge told so under
// `startedWith`. When the port can run the deployment's start hook ahead of
// the check (`prepareStart`, `../../service/subflow-trial/port.ts`), it runs
// first and the reset is told the site was just put back, so every act counts
// undone and the model is asked for nothing (t475, t479); what the hook took
// back is answered as `absorbedByStartReset`, and the acts on the site after
// the trial as `leftOnSite`. The hook then runs before the predecessor check,
// so even a trial whose entry cannot be prepared leaves the site put back.
// Without a reset a trial runs on the site as it stands, as before.
//
// With no port the tool says `subflow.trial_unavailable` and completion needs
// only the latest valid proposal, which then stands untried.
//
// **A yes Core could not confirm is said as one (t601).** On A8 launch 8
// (everything-store) every judge answered yes on twelve trials whose rows were
// exactly right, Core held each yes for the exclusion evidence it lacked, and
// the trial came back `not_judged` with "change and resubmit it if the
// feedback names a cause": the builder read the hold as a cause and rewrote a
// correct subflow seven times. A `not_judged` whose reason is that hold now
// says the judges answered yes and Core could not confirm it, and not to
// rewrite a subflow whose rows they accepted: test it again, or end the brief
// partial once the retests run out. Any other `not_judged` is said as before.
//
// **The hold is read as a fact, not as words (t611).** The gate matched
// "exclusion evidence" in the feedback's `why`, so a reworded reason would
// have lost the instruction, and a held yes beside a call that could not tell
// was said as if every judge had answered yes. Core's result verification now
// says the fact (`yesUnconfirmed`, `../../result-verification/contracts/verification.ts`),
// set only where every judge call answered yes, and the trial's feedback
// carries it (`../../service/candidate-trial/feedback.ts`); the gate reads that
// field and never the words.
//
// **An unsure says a re-test is allowed, and when it is the better move
// (t632).** A8 wave 8 `run-mv9gbsm5-2957581c` (0051-0054): a revision whose
// rows were exactly right came back unsure, one call yes and one no, and the
// builder followed the no's advice, rebuilding a revision already judged no,
// when the trial's own `readings` already said to test the same revision again
// where the evidence supports the yes. The unsure instruction said "test this
// revision again if the feedback says nothing about the subflow itself", which
// a no-reading always seems to. It now says, while retests are left, that
// testing the same revision again is allowed, and that it is the better move
// when one call said yes, when Core's record contradicts the other call, or
// when that call's advice would take back what answered an earlier no; with
// none left, it says to change the subflow for a defect the trial shows.
//
// **An exclusion a standing no upheld holds across the brief's trials
// (t633).** The same run then swung between two revisions: one kept a row its
// judges rightly called not the asked kind and was judged no; the other left
// that row out by several conditions together and stored exactly the rows
// asked for, and its judges said no, asking to remove those very conditions.
// Each no was weighed as if fresh. A trial judged no now hands the gate Core's
// own record of it (`standingNo`, beside the feedback, never shown to a model;
// `../../result-verification/standing-no/`). The gate keeps the records that
// upheld rows of a kind, and a later no whose remedy would take back exactly
// those rows -- this revision stores none of them, and the no asks only to
// remove conditions this revision added since, which would take its read back
// to the conditions that kept them -- is contradicted by the build's own
// record: not taken, so the trial is unsure, its revision is not closed, and
// the builder is told why in Core's words (`contradictedByBuild`) and to test
// the same revision again rather than make that change. Never a yes: a yes
// still needs a trial its judges answer yes.
//
// **...and across the briefs of its subflow, and the gate's verdict is the
// one told (t634).** A8 wave 8 towels: brief 1's upheld exclusion never
// reached repair brief 2, a builder loop with a gate of its own, and the
// receipts and the build's proposals read each trial before this gate weighed
// it, so a receipt said `no` where the gate said `unsure`. The port may now
// carry two hooks (`AutomationStudioSubflowTrialPreparingPort`), both Core's,
// neither shown to a model: `standingNos`, the standing nos earlier briefs of
// this subflow kept in this build, which seed this gate's memory as it is
// made (at revisions below 1, so no revision of this brief is mistaken for
// one of theirs, and the builder is told the revision was an earlier brief's);
// and `weighed`, told each trial's answer as this gate keeps it, with Core's
// record of a no it kept standing, so the dispatcher lists and remembers the
// gate's verdict (`../../project-agents/dispatch/trial-port.ts`).
//
// **A re-test is advised on Core's findings, and the conditions Core's record
// kept are remembered (t641).** As the whole gate does
// (`../candidate/trial-gate.ts`; A8 wave 14 candidate towels
// `run-mv9ul5dy-e9a1b1c1`): an unsure says a re-test is the better move only
// where Core's record contradicts what kept the trial from a yes -- the no's
// reading wholly, or the unsure call's doubt -- and says so as a field
// (`retestAdvised`), never because one judge call said yes; and the conditions
// Core's record of a trial judged no showed keep out only rows the request does
// not ask for are kept as the proposal that ran wrote them, on the result kept
// for each trial (`keptConditions`), for the brief's submission controller to
// refuse once a proposal that drops one (`./scoped-submission.ts`). Earlier
// briefs' kept conditions do not reach this gate: only its own trials'.
//
// **And never that nothing contradicts a no Core refutes in part (t652).** As
// the whole gate says it (`../candidate/trial-gate.ts`): where the no's reading
// carries `recordContradicts: "part"`, the unsure's words say Core's record
// contradicts part of it and to change the subflow only for what the rest
// names; `retestAdvised` stays false. A trial judged unsure now hands this gate
// Core's record too (`standingNo`), so its kept conditions come from any judged
// trial, not only a no.
//
// **A split is said as a split (t725).** Social r4 `run-mvfq957o-40103539`
// (0083): an exact revision's judges split, the words said a re-test was
// "likely to be judged the same way", and the builder changed the right answer
// for the no. As the whole gate now says it (`../candidate/trial-gate.ts`): an
// unsure whose feedback carries the yes's reading (`answeredReading`, only on a
// split) says the two calls disagreed, where each one's reading is, and to
// change the subflow only for a row, column or value the no names that the
// trial shows.
//
// **A trial on a page this brief's exploration changed, and no step does, says
// so (t647; A8 bigbox debug `run-mv9zn5ob-d929084d`, fix 6).** A builder
// pressed a control while exploring that changed what the site offers, built
// on the page that act left, and every trial's start hook took the act back;
// no step of its subflow, nor of one before it, does it, so each trial met a
// page the builder never explored and failed, and the evidence only listed the
// act as taken back. Where a trial that is not a yes, its entry prepared,
// started after the start hook took back an act this brief's own exploration
// made on a named control, and no step of this proposal nor any act the trial
// landed (the predecessors' among them) names that control, its feedback
// carries Core's finding under `coreFindings`, code
// `trial.explored_on_absorbed_act` first, naming the act as the act log
// records it (`../site-reset/explored-on-absorbed.ts`). An unprepared entry
// says nothing: the predecessors' steps did not all run, so what they do was
// not measured.
//
// **A control on the page but not shown, and a trial the purse cannot judge
// (t661).** As the whole candidate's gate does (`../candidate/trial-gate.ts`):
// a trial that stopped at a step whose feedback says `targetNotShown` is told
// to change the steps that lead to it, never to test the same revision; and a
// trial the port did not start because the purse cannot hold its two judge
// calls (`subflow.trial_unaffordable`) is no trial -- nothing is counted or
// kept, and the refusal carries no retry reason.
//
// **A trial the port did not run is said as the port says it (t679).** A port
// may answer a trial it did not start with `notRun` beside its result
// (`AutomationStudioSubflowTrialNotRun`): its code, what the builder is to do,
// what it is shown, and whether the same test may reach the gate again. As for
// a trial the purse cannot judge, nothing is counted, kept, weighed or reset,
// and no verdict is given: the answer is the port's refusal itself. A
// single-subflow plan's whole test answers that way when the whole Flow could
// not be joined or its gate would not run it
// (`../../project-agents/single-subflow/single-subflow-trial.ts`).
//
// **A single-subflow plan's test is the judged whole run (t679).** Given
// `whole`, the gate's tool says that a test runs the whole Flow from its start
// as the build's judged run and that a yes completes the brief, and a yes says
// the same, never that it is a partial trial for this brief only.
//
// **And the conditions the whole gate kept reach this gate (t689).** That
// test's answer carries no record of its own (`standingNo` stays with the
// whole gate, which weighs a later no against it), so nothing reached this
// gate's memory and its controller let a proposal drop a condition Core's
// record had kept. The port's result may now carry kept conditions another
// gate already found (`keptConditions`, Core-only, never shown to a model):
// that gate's latest list, on this brief's numbering
// (`../../project-agents/single-subflow/single-subflow-trial.ts`). A trial
// whose entry was prepared replaces the list carried before with it, conditions
// it no longer holds included, and the conditions this gate keeps for each
// trial are its own memory's with the carried ones beside them.
//
// **A yes over a read that kept every item it saw, after an act repeated over a
// narrower read of the same list, stands only on the converse check (t692).** A8
// cost round 2 `run-mvbr0w7e-6a01c05b`: a single-subflow test acted on the 4
// rows of 8 a condition kept, then read the same list with no condition and
// stored all 8; both judge calls said the table holds all 8 rows and yes, and
// the Flow was promoted on it. Core's read accounts now flag such a read
// (`keptEveryRow`, `../../result-verification/read-account/kept-every-row.ts`),
// which the judge is shown, and the port carries the flagged reads beside its
// result (`keptEveryRow`, Core-only). The check that holds each row such a read
// stored to the request's words is the judge's own confirming call: since
// t691 it asks the converse question, each stored row against the request's
// words that ask for it in the answer
// (`../../result-verification/agreement/ask-again.ts`), and a yes both calls
// gave, the second the converse, is `firstAskConfirmed`. So on a yes whose
// entry was prepared and that carries a flagged read, the gate asks the port's
// `checkRows` whether that yes was so confirmed; no second copy of the per-row
// question is asked. A confirmed yes stands, and its feedback says why. One
// that was not -- a yes reached through re-asks, or on a repeat of the first
// question -- a check that fails, or a port with no `checkRows` is not taken:
// the trial is unsure (`subflow.trial_rows_unaccounted`), its revision is not
// closed, and the builder is told why in Core's words with the flag's sentence
// for each read; a test of the same revision asks the judge again.
//
// **An execution-failed trial says what stopped it, and the same stop twice
// closes the revision (lane 3, `run-mvcvzwk1-c1d869e4`).** Two whole tests of
// one revision came back with `candidate.trial_port_failed` and nothing else,
// the instruction sent the builder to a failed step no feedback named, and it
// tested the same revision again, blind. Every `execution_failed` answer now
// carries `stoppedBy` in its feedback (`../candidate/trial-stop.ts`), the
// instruction names it -- a trial runner that failed is never said to be a
// subflow before this one that did -- and two trials of one revision that
// stopped the same way close it, as the whole gate's t368 rule does: the answer
// carries no re-test and a later test is refused `subflow.trial_same_failure`.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION,
  AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS,
  automationStudioCandidateNotShownInstruction,
  automationStudioCandidateRecordContradictsPart,
  automationStudioCandidateRetestAdvised,
  automationStudioCandidateStartedWithSaid,
  automationStudioCandidateTrialStop as Stop,
  type AutomationStudioCandidateTrialPrepared,
  type AutomationStudioCandidateTrialVerdict
} from "../candidate/index.ts";
// Its own barrel, not result-verification's, whose reads import flow-bootstrap back (a module cycle).
import {
  AutomationStudioResultKeptConditionMemory,
  AutomationStudioResultStandingNoMemory,
  type AutomationStudioResultKeptCondition,
  type AutomationStudioResultKeptConditionsCarrier,
  type AutomationStudioResultStandingNoContradiction
} from "../../result-verification/standing-no/index.ts";
import type { AutomationStudioResultKeptEveryRow } from "../../result-verification/contracts/index.ts";
import { automationStudioSiteResetExploredOnAbsorbed, type AutomationStudioSiteResetNamedAct, type AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowScopeIdentity, AutomationStudioSubflowTrialPort, AutomationStudioSubflowTrialResult } from "./contracts.ts";

/**
 * A partial trial port that can run the deployment's start hook ahead of the
 * gate's reset check (header), as a whole candidate's port can
 * (`AutomationStudioCandidateTrialPort["prepareStart"]`). The trial of that
 * brief, revision and digest that follows uses that start and does not run
 * the hook again.
 */
export type AutomationStudioSubflowTrialPreparingPort = AutomationStudioSubflowTrialPort & {
  prepareStart?: ((input: { scope: AutomationStudioSubflowScope; revision: number; digest: string; signal: AbortSignal }) => Promise<AutomationStudioCandidateTrialPrepared>) | undefined;
  /** The standing nos earlier briefs of this subflow kept in this build, oldest first, read once as the gate is made (header, t634). Core-only. */
  standingNos?: readonly unknown[] | undefined;
  /** Told each trial the gate asked, as the gate weighed it (header, t634). */
  weighed?: ((trial: AutomationStudioSubflowTrialWeighed) => void) | undefined;
  /**
   * Whether the trial's yes over flagged reads was confirmed by the converse
   * question (header, t692): an `AutomationStudioSubflowTrialRowCheck`.
   * Absent, such a yes is not taken.
   */
  checkRows?: ((input: { scope: AutomationStudioSubflowScope; revision: number; digest: string; trialRunId?: string | undefined; reads: AutomationStudioSubflowTrialKeptEveryRowRead[]; signal: AbortSignal }) => Promise<unknown>) | undefined;
};

/** A read the trial flagged (header, t692), as the port carries it beside its result under `keptEveryRow`: its step, the rows it stored, and Core's flag. Core-only. */
export type AutomationStudioSubflowTrialKeptEveryRowRead = { nodeId: string; kept: number; keptEveryRow: AutomationStudioResultKeptEveryRow };

/**
 * The port's answer to the row check (header, t692): `confirmed` where the
 * trial's yes was given by both judge calls, the second asking the converse
 * question of each stored row (`firstAskConfirmed`); `unconfirmed` otherwise.
 */
export type AutomationStudioSubflowTrialRowCheck = { converse: "confirmed" | "unconfirmed" };

/**
 * A trial the port did not run (header, t679), carried beside the result it
 * answers: its code, what the builder is to do, what else it is shown, and
 * whether the same test may reach the gate again. The result's verdict is then
 * no verdict and is never read.
 */
export type AutomationStudioSubflowTrialNotRun = {
  notRun: { code: string; instruction: string; detail?: JsonObject | undefined; retry?: boolean | undefined };
};

/** A trial as the gate weighed it (header, t634): never shown to a model. */
export type AutomationStudioSubflowTrialWeighed = {
  /** The trial's answer as the gate keeps it: its verdict is the gate's, the trial's own code first in its feedback. */
  answer: AutomationStudioSubflowTrialResult;
  /** Core's record of the no this answer is, where the gate let that no stand; absent otherwise. */
  standingNo?: unknown;
};

/** The builder's test tool: one partial trial of its latest proposal. */
export const AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID = "core.test_subflow";

const RETEST_REASON = "retry_allowed";
const TRANSIENT: ReadonlySet<AutomationStudioCandidateTrialVerdict> = new Set(["unsure", "not_judged", "execution_failed"]);

/** The code of a trial the purse could not pay to judge, so it did not start (header, t661). */
const UNAFFORDABLE_CODE = "subflow.trial_unaffordable";

/** What the builder is told when a trial did not start because the purse cannot pay its judge calls (header, t661). Generic words. */
const UNAFFORDABLE_INSTRUCTION = "Core did not start this trial: the money this brief has left cannot pay the two judge calls that judge a trial, so nothing ran and no judge was asked (notRun has the figures). "
  + "Testing again is refused the same way while that stands, so do not test again, and do not spend calls changing the subflow for a trial that cannot run.";

/** The tool's description, by whether a test is the judged whole run (header, t679). Generic words. */
const RESET_WORDS = "Before a trial, put the site back the way this build found it: if this answers candidate.trial_reset_required, undo the acts it lists, then test again; an act the site offers no control to undo goes under cannotUndo, and the trial runs with it already done.";
const SUBFLOW_DESCRIPTION = "Ask Core to try your latest submitted subflow once, on its own with no model: from the start page, it runs the subflows before this one to reach its entry, runs this subflow with its inputs, and judges it against its parts and success check. Give that proposal's revision and digest exactly. The answer is a partial verdict (yes, no, unsure, not_judged or execution_failed) with feedback; it counts for this brief only. The run acts on the site like the saved subflow would. "
  + `${RESET_WORDS} Complete only after a yes for that exact revision and digest. If it answers subflow.trial_unavailable, no trial can run here.`;
const WHOLE_DESCRIPTION = "Ask Core to test your latest submitted subflow as the whole Flow: the plan is your one subflow, so Core joins it into the whole Flow and runs that once from its start with no model, and the judge says whether the run did what the person asked. This test is the build's judged run: a yes completes this brief, and the supervisor completes the Flow on it. "
  + "Give that proposal's revision and digest exactly. The answer is a verdict (yes, no, unsure, not_judged or execution_failed) with feedback. The run acts on the site like the saved Flow would. "
  + `${RESET_WORDS} Complete only after a yes for that exact revision and digest. If it answers subflow.trial_unavailable, no trial can run here.`;
/** What a yes says when the test was the judged whole run (header, t679). Generic words. */
const WHOLE_YES = "The whole Flow's test passed for this exact revision and digest: it is the build's judged run. Complete with exactly this subflowKey, revision and digest; the supervisor completes the Flow on it. Submitting again makes a new revision that needs its own test.";

const INSTRUCTIONS: Readonly<Record<AutomationStudioCandidateTrialVerdict, string>> = Object.freeze({
  yes: "This subflow's trial passed for this exact revision and digest. It is a partial trial: it answers for this brief only and is no trial of the whole Flow. Complete with exactly this subflowKey, revision and digest. Submitting again makes a new revision that needs its own trial.",
  no: "The judge found this subflow did not do what its parts ask. Read the feedback, change the subflow to fix it, submit it with core.submit_subflow, then test the new revision. This exact proposal cannot be tested again or completed.",
  unsure: "The judge could not confirm this subflow did what its parts ask, and this revision has no retests left, so it cannot complete. Change the subflow for a defect the trial's own reads, steps and stored rows show, submit it with core.submit_subflow, then test the new revision.",
  not_judged: "The trial was not judged, so this revision cannot complete. Test it again, or change and resubmit it if the feedback names a cause in the subflow.",
  execution_failed: "The subflow did not run to its end, so this revision cannot complete. Read the feedback for the step that failed. If trying again may pass, test this same revision again; otherwise correct that step, submit the subflow, then test the new revision."
});

/**
 * Said for a `not_judged` the judges answered yes to (header, t601), which the
 * trial's feedback says as `yesUnconfirmed: true` (t611): Core's result
 * verification sets it where every judge call answered yes and Core held that
 * yes for the exclusion evidence it lacked
 * (`../../result-verification/agreement/`, `../../result-verification/verdict/`).
 */
const NOT_JUDGED_AFTER_YES = "The judges answered yes for this revision and none answered no, but Core could not confirm that yes (the feedback's why says what it lacked), so the trial counts as not judged and this revision cannot complete yet. "
  + "The judges accepted the rows this subflow kept: do not rewrite it or change which rows it keeps. Test this same revision again; if its retests run out held the same way, "
  + "end the brief: complete with {\"ended\": \"partial\", \"reason\": \"<the judges answered yes and Core could not confirm it>\"}.";

/**
 * Said for an unsure while the revision may still be tested (header, t632,
 * t641): a re-test is allowed, and the better move only where Core's record
 * contradicts what kept the trial from a yes (`retestAdvised`). Generic words.
 */
const UNSURE_RETEST_ADVISED = "The judge could not confirm this subflow did what its parts ask, so this revision cannot complete yet. "
  + "Core's record contradicts what kept this trial from a yes (retestAdvised is true): the no's reading, which its label in unconfirmedReading says Core's record contradicts, or the doubt doubtContradicted names. "
  + "So testing this same revision again, with the same revision and digest, is the better move (retestsLeft says how many times), and a change that contradicted reading asks for is not. "
  + "Change the subflow only for a defect the trial's own reads, steps and stored rows show, submit it with core.submit_subflow, then test the new revision.";
const UNSURE_RETESTABLE = "The judge could not confirm this subflow did what its parts ask, so this revision cannot complete yet. "
  + "Nothing in Core's record contradicts what kept this trial from a yes (retestAdvised is false), so another trial of this same revision is likely to be judged the same way, whatever one judge call said. "
  + "Change the subflow for the defect the no's reading or the doubt names where the trial's own reads, steps and stored rows show it, submit it with core.submit_subflow, then test the new revision. "
  + "Testing this same revision again, with the same revision and digest, stays allowed (retestsLeft says how many times) where that evidence shows no such defect.";
/** Said for an unsure whose two judge calls split (header, t725): never that a re-test is likely to be judged the same way. Generic words. */
const UNSURE_SPLIT = "The judge could not confirm this subflow did what its parts ask, so this revision cannot complete yet. "
  + "The two judge calls read this same trial and disagreed: one said it does what its parts ask (answeredReading is what it compared), the other that it does not (unconfirmedReading is what it compared and advised, where it gave any). "
  + "The same evidence drew both answers and nothing in Core's record settles which is right (retestAdvised is false), so neither answer is the verdict. "
  + "Change the subflow only for a row this trial kept that its parts do not ask for, a row they ask for that this trial left out, or a wrong column or value, where the no names it and the trial's own reads, steps and stored rows show it; a concern about rows this trial did not show is no such defect. Then submit it with core.submit_subflow and test the new revision. "
  + "Testing this same revision again, with the same revision and digest, stays allowed (retestsLeft says how many times) where that evidence shows no such defect.";
/** Said where Core's record contradicts part of the no's reading (header, t652): never that nothing does. Generic words. */
const UNSURE_PART_CONTRADICTED = "The judge could not confirm this subflow did what its parts ask, so this revision cannot complete yet. "
  + "Core's record contradicts part of the no's reading, as its label in unconfirmedReading says (retestAdvised is false): make no change for that part. "
  + "Change the subflow only for what the rest of it names where the trial's own reads, steps and stored rows show it, submit it with core.submit_subflow, then test the new revision. "
  + "Testing this same revision again, with the same revision and digest, stays allowed (retestsLeft says how many times) where that evidence shows no such defect.";

/**
 * Said for a no the build's own record contradicts while the revision may
 * still be tested (header, t633): why it is not taken, and to test again
 * rather than make its change. Generic words.
 */
const CONTRADICTED_RETESTABLE = "The judge answered no, but Core's record of this build contradicts that no (contradictedByBuild in the feedback says how): the change it asks for would bring back rows that an earlier no of this subflow, which stood, called not what the parts ask for. "
  + "So that no is not taken: this revision is unsure, not closed. Test this same revision again, with the same revision and digest (retestsLeft says how many times), and do not make the change that no asks for. "
  + "Change the subflow only for a defect the trial's own reads, steps and stored rows show, submit it with core.submit_subflow, then test the new revision.";

/** The code of a yes the row check did not let stand (header, t692). */
const ROWS_UNACCOUNTED = "subflow.trial_rows_unaccounted";

/** What the feedback says of a row check, by its outcome (header, t692). Generic words. */
const FLAGGED = "Core flagged a read that kept every item it saw after an act ran over a narrower read of the same list (keptEveryRow says what Core measured)";
const ROW_CHECK_WORDS = Object.freeze({
  confirmed: `The judges answered yes. ${FLAGGED}, and the second judge call asked the converse question, each row the result stores against the request's words that ask for it in the answer, and answered yes too, so the yes stands.`,
  unconfirmed: `The judges answered yes, but ${FLAGGED}, and this yes was not given by a second call asking the converse question of each row the result stores, so it is not taken: the trial is unsure, and this revision is not closed.`
});

/** Said for a yes the row check could not confirm while the revision may still be tested (header, t692). Generic words. */
const ROWS_UNACCOUNTED_RETESTABLE = "The judges answered yes, but a read of this subflow kept every item it saw after an act ran over a narrower read of the same list, and the yes was not confirmed by a judge call asking of each row it stored whether the request asks for it, so this revision cannot complete yet. "
  + "Read keptEveryRow: each row such a read stores must be one the request's own words ask for in its answer. If the request asks for only some of them, give that read a condition that keeps exactly those, submit the subflow with core.submit_subflow, then test the new revision; "
  + "if it asks for every one of them, test this same revision again (retestsLeft says how many times).";

/** Said instead when a predecessor did not run to its end: the target never started where it should. */
/** The first sentence of every execution-failed instruction (header, lane 3): what stopped the trial follows it (`../candidate/trial-stop.ts`). */
const EXECUTION_FAILED_HEAD = "The subflow did not run to its end, so this revision cannot complete.";
/** How the builder's words say to submit a change. */
const RESUBMIT = "submit the subflow with core.submit_subflow";
/** What the builder is told once a revision stopped the same way at the same step twice (header, lane 3). */
const SAME_FAILURE_INSTRUCTION = `This revision stopped at the same step with the same failure in two trials, so testing it again would fail the same way. Change that step, or the steps that lead to it, ${RESUBMIT}, then test the new revision.`;

const ENTRY_NOT_PREPARED = "A subflow that runs before this one did not run to its end, so this subflow did not start from its prepared entry and the verdict says nothing about it. Test this revision again; if it keeps failing there, complete with outcome blocked and say why.";

/** The model-facing partial test tool and the builder's completion rule bound to its verdicts. */
export class AutomationStudioSubflowTrialGate {
  /** The model-facing test tool, described by whether a test is the judged whole run (header, t679). */
  readonly tool: AutomationStudioLlmEvidenceTool;
  private static readonly toolInput: JsonObject = {
    inputSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" },
      cannotUndo: { type: "array", maxItems: 50, items: { type: "string", pattern: "^act-[1-9][0-9]{0,3}$" }, description: "Only after candidate.trial_reset_required listed them: the acts the site offers no control to undo. The trial then runs with them already done, and the judge is told." } },
    required: ["revision", "digest"], additionalProperties: false }
  };
  /** Each trial's answer as kept, with the kept conditions as of that trial (header, t641): what `standing` hands the submission controller. */
  private readonly verdicts = new Map<string, AutomationStudioSubflowTrialResult & AutomationStudioResultKeptConditionsCarrier>();
  private readonly closedDigests = new Map<string, JsonObject>();
  private readonly trials = new Map<string, number>();
  /** How each revision's execution-failed trials stopped, and the revisions that stopped the same way twice, with what stopped them (header, lane 3). */
  private readonly stops = new Map<string, Set<string>>();
  private readonly repeatedFailures = new Map<string, JsonObject>();
  /** The brief's standing nos that upheld rows of a kind, for a later no to be held to (header, t633). */
  private readonly standingNos = new AutomationStudioResultStandingNoMemory();
  /** The conditions Core's record showed keep out only rows the request does not ask for (header, t641). */
  private readonly keptConditions = new AutomationStudioResultKeptConditionMemory();
  /** The kept conditions the latest prepared trial's port carried, found by another gate (header, t689). */
  private carriedKept: AutomationStudioResultKeptCondition[] = [];
  private readonly fallbackSignal = new AbortController().signal;

  constructor(private readonly input: {
    scope: AutomationStudioSubflowScope;
    latest: () => AutomationStudioSubflowProposal | undefined;
    port?: AutomationStudioSubflowTrialPreparingPort | undefined;
    signal?: AbortSignal | undefined;
    /** The site reset before each trial (header): the brief's ledger and start check. Absent, a trial runs on the site as it stands. */
    reset?: AutomationStudioSiteResetTrialReset | undefined;
    /** The earlier brief's revision this brief starts from, which its own are numbered on from (header, t658). */
    revisionsAfter?: number | undefined;
    /** Whether a test is a single-subflow plan's judged whole run, which the tool and a yes say (header, t679). */
    whole?: true | undefined;
  }) {
    this.tool = { toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, effect: "mutate", description: input.whole ? WHOLE_DESCRIPTION : SUBFLOW_DESCRIPTION, inputSchema: structuredClone(AutomationStudioSubflowTrialGate.toolInput.inputSchema as JsonObject) };
    if (input.port !== undefined && typeof input.port !== "function") throw new Error("subflow.trial_port_invalid");
    // Earlier briefs' standing nos, at revisions below 1, oldest first (header, t634).
    const earlier = Array.isArray(input.port?.standingNos) ? input.port.standingNos : [];
    earlier.forEach((standingNo, index) => this.standingNos.weigh({ revision: index - earlier.length, verdict: "no", standingNo }));
  }

  get available(): boolean { return this.input.port !== undefined; }

  /** What a stale refusal says first of a revision at or below the one this brief starts from (header, t658); nothing for any other. */
  private earlierBrief(revision: number): string {
    const after = this.input.revisionsAfter;
    if (after === undefined || revision < 1 || revision > after) return "";
    return `Revision ${revision} is not one of this brief's: it is an earlier brief's, the one this brief was shown and starts from, and it cannot be tested here. This brief's own revisions are numbered on from ${after}. `;
  }

  async test(value: JsonObject, callSignal?: AbortSignal): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const revision = value.revision;
    const digest = value.digest;
    const cannotUndo = value.cannotUndo;
    if (!Number.isSafeInteger(revision) || typeof digest !== "string" || Object.keys(value).some((key) => key !== "revision" && key !== "digest" && key !== "cannotUndo")
      || (cannotUndo !== undefined && !(Array.isArray(cannotUndo) && cannotUndo.length <= 50 && cannotUndo.every((act) => typeof act === "string")))) {
      return refused("subflow.trial_input_invalid", `Call ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} with exactly the latest proposal's revision (an integer) and digest (a string), as core.submit_subflow returned them, and optionally cannotUndo: the act ids a reset listed that the site cannot undo.`);
    }
    const port = this.input.port;
    if (!port) return refused("subflow.trial_unavailable", "No subflow trial runner is available here. Complete with the latest subflowKey, revision and digest; the proposal stays untried.");
    const latest = this.input.latest();
    // A revision at or below the one this brief starts from is an earlier brief's, said so beside this brief's own (header, t658).
    const earlier = this.earlierBrief(revision as number);
    if (!latest) return refused("subflow.trial_stale_revision", `${earlier}There is no valid latest proposal to test. Submit this subflow with core.submit_subflow, then test the revision and digest it returns.`, earlier ? { earlierRevision: revision as number } : {});
    if (latest.revision !== revision || latest.digest !== digest) {
      return refused("subflow.trial_stale_revision", `${earlier}Only the latest proposal can be tested. Test the revision and digest given here.`, { latestRevision: latest.revision, latestDigest: latest.digest, ...(earlier ? { earlierRevision: revision as number } : {}) });
    }
    const closed = this.closedDigests.get(latest.digest);
    if (closed) return refused("subflow.trial_unchanged_after_no", "This exact proposal was already tried and judged no. Change it to address that feedback, submit it, then test the new revision.", { previousFeedback: closed });
    const repeated = this.repeatedFailures.get(key(latest));
    if (repeated) return refused("subflow.trial_same_failure", repeatedInstruction(repeated), { failedStep: repeated });
    const tried = this.trials.get(key(latest)) ?? 0;
    if (tried >= AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION) {
      return refused("subflow.trial_retest_limit", `This exact revision has been tested ${tried} times without a yes, so it is not tested again. Change the step the last feedback names, submit the subflow, then test the new revision.`, { trials: tried, maxTrials: AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION });
    }
    const signal = callSignal ?? this.input.signal ?? this.fallbackSignal;
    signal.throwIfAborted();
    // The deployment's start hook first, so the check after it finds the site put back (header).
    const prepared = this.input.reset && port.prepareStart ? await port.prepareStart({ scope: structuredClone(this.input.scope), revision: latest.revision, digest: latest.digest, signal }) : "none";
    signal.throwIfAborted();
    const reset = await this.input.reset?.beforeTrial(signal, Array.isArray(cannotUndo) ? cannotUndo as string[] : undefined, prepared === "reset" ? { startReset: true } : undefined);
    signal.throwIfAborted();
    // Not a trial: the model is told what to put back, and the identical test after it reaches this gate again (header).
    if (reset?.kind === "refuse") return { kind: "llm_evidence_tool_execution", evidence: reset.evidence, effectApplied: reset.moved, targetsUnchanged: !reset.moved, resultCode: reset.evidence.code, resultReason: RETEST_REASON };
    // What the hook took back before this trial is answered with it, whatever the trial then answers.
    const absorbedActs = reset?.kind === "admit" ? reset.absorbedByStartReset ?? [] : [];
    const absorbed = absorbedActs.map(namedAct);
    this.trials.set(key(latest), tried + 1);
    const asked = await this.ask(port, latest, signal, reset?.kind === "admit" ? automationStudioCandidateStartedWithSaid(reset.startedWith) : []);
    // Not a trial: the port did not run it, and says why in the builder's terms (header, t679).
    if (asked.notRun) {
      this.trials.set(key(latest), tried);
      const { code, instruction, detail, retry } = asked.notRun;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, instruction, ...(detail ? structuredClone(detail) : {}) }, effectApplied: false, targetsUnchanged: true, resultCode: code, ...(retry ? { resultReason: RETEST_REASON } : {}) };
    }
    // Not a trial: the purse could not pay its two judge calls, so nothing ran and nothing is counted (header, t661).
    if (asked.answer.feedback.code === UNAFFORDABLE_CODE) {
      this.trials.set(key(latest), tried);
      return refused(UNAFFORDABLE_CODE, UNAFFORDABLE_INSTRUCTION, { notRun: asked.answer.feedback });
    }
    // A yes over a read that kept every item it saw after an act over a narrower read is asked again with a row check (header, t692).
    if (asked.answer.verdict === "yes" && asked.answer.entryPrepared && asked.keptEveryRow?.length) {
      asked.answer = await this.checkRows(port, asked.answer, asked.keptEveryRow, signal);
      signal.throwIfAborted();
    }
    // A no whose remedy would take back what an earlier standing no of this subflow upheld is not taken (header, t633, t634).
    const contradiction = asked.answer.entryPrepared ? this.standingNos.weigh({ revision: asked.answer.revision, verdict: asked.answer.verdict, standingNo: asked.standingNo }) : undefined;
    const weighedAnswer = contradiction ? notTaken(asked.answer, contradiction) : asked.answer;
    // The page this brief explored was changed by an act the start took back and no step does (header, t647).
    const explored = weighedAnswer.verdict !== "yes" && weighedAnswer.entryPrepared
      ? automationStudioSiteResetExploredOnAbsorbed({ absorbed: absorbedActs, owner: this.input.scope.briefId, steps: (latest.subflows ?? []).flatMap((subflow) => subflow.nodes ?? []), ran: weighedAnswer.acts, whose: "subflow" })
      : [];
    // An execution-failed trial says what stopped it, in its own feedback (header, lane 3).
    const answer = Stop.told(explored.length ? withCoreFindings(weighedAnswer, explored) : weighedAnswer);
    // The port is told the gate's verdict, even of a trial a stop then cuts short (header, t634).
    const stood = answer.verdict === "no" && answer.entryPrepared && asked.standingNo !== undefined;
    port.weighed?.({ answer: structuredClone(answer), ...(stood ? { standingNo: structuredClone(asked.standingNo) } : {}) });
    signal.throwIfAborted();
    const leftOnSite = this.input.reset?.trialRan(answer.acts ?? [], answer.trialRunId);
    // What Core's record of this trial shows its conditions kept out, as the proposal that ran wrote them (header, t641).
    if (answer.entryPrepared) this.keptConditions.remember({ revision: answer.revision, standingNo: asked.standingNo, plan: latest.subflows ? { subflows: latest.subflows } : undefined });
    // What another gate found, carried by the port, replaces what it carried before (header, t689).
    if (answer.entryPrepared && asked.keptConditions) this.carriedKept = asked.keptConditions;
    const keptConditions = withCarried(this.keptConditions.conditions(), this.carriedKept);
    this.verdicts.set(key(answer), keptConditions.length ? { ...answer, keptConditions } : answer);
    if (answer.verdict === "no" && answer.entryPrepared) this.closedDigests.set(answer.digest, answer.feedback);
    const repeatedStep = this.recordStop(answer);
    const retestsLeft = !repeatedStep && (TRANSIENT.has(answer.verdict) || !answer.entryPrepared) ? AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION - (tried + 1) : 0;
    const evidence: JsonObject = {
      ok: answer.verdict === "yes", partial: true, verdict: answer.verdict, subflowKey: answer.identity.subflowKey, revision: answer.revision, digest: answer.digest,
      entryPrepared: answer.entryPrepared, feedback: answer.feedback, promotionCredit: false,
      instruction: repeatedStep ? repeatedInstruction(repeatedStep) : instructionFor(answer, retestsLeft > 0, this.input.whole === true),
      ...(repeatedStep ? { failedStep: repeatedStep } : {}),
      ...(reset?.kind === "admit" && reset.startedWith ? { startedWith: reset.startedWith } : {}),
      ...(absorbed.length ? { absorbedByStartReset: absorbed } : {}),
      ...(leftOnSite?.length ? { leftOnSite: leftOnSite.map(namedAct) } : {})
    };
    if (answer.trialRunId) evidence.trialRunId = answer.trialRunId;
    if (TRANSIENT.has(answer.verdict) || !answer.entryPrepared || repeatedStep) evidence.retestsLeft = retestsLeft;
    // Whether Core's record contradicts what kept an unsure from a yes: the fact its instruction rests on (header, t641).
    if (answer.verdict === "unsure" && answer.entryPrepared && retestsLeft > 0 && typeof answer.feedback.contradictedByBuild !== "string") evidence.retestAdvised = automationStudioCandidateRetestAdvised(answer);
    const answered: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence, effectApplied: true, targetsUnchanged: false, resultCode: `subflow.trial_${answer.verdict}` };
    if (retestsLeft > 0) answered.resultReason = RETEST_REASON;
    return answered;
  }

  /** The builder's completion rule, asked once the receipt names the latest proposal. Never the whole candidate's. */
  completion(receipt: { revision: number; digest: string }): AutomationStudioLlmEvidenceCompletionCheck {
    if (!this.input.port) return { ok: true };
    const answer = this.verdicts.get(key(receipt));
    if (answer?.verdict === "yes" && answer.entryPrepared) return { ok: true };
    const closed = this.closedDigests.get(receipt.digest);
    if (closed) return refusal("subflow.trial_unchanged_after_no", "This exact proposal was judged no and has not changed. Change it, submit it, test the new revision, and complete only after a yes.", { previousFeedback: closed });
    if (!answer) return refusal("subflow.trial_required", `Test this proposal first: call ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} with revision ${receipt.revision} and digest ${receipt.digest}, and complete only after it answers yes for that revision and digest.`);
    const repeated = this.repeatedFailures.get(key(receipt));
    if (repeated) return refusal(`subflow.trial_${answer.verdict}`, repeatedInstruction(repeated), { verdict: answer.verdict, entryPrepared: answer.entryPrepared, failedStep: repeated, trialFeedback: answer.feedback });
    const retestable = (this.trials.get(key(receipt)) ?? 0) < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION;
    const advised = answer.verdict === "unsure" && answer.entryPrepared && retestable && typeof answer.feedback.contradictedByBuild !== "string" ? { retestAdvised: automationStudioCandidateRetestAdvised(answer) } : {};
    return refusal(`subflow.trial_${answer.verdict}`, instructionFor(answer, retestable, this.input.whole === true), { verdict: answer.verdict, entryPrepared: answer.entryPrepared, trialFeedback: answer.feedback, ...advised });
  }

  /**
   * Records how an `execution_failed` trial stopped, and answers what stopped it
   * when an earlier trial of the same revision stopped the same way, which
   * closes the revision to re-testing (header, lane 3; the whole gate's t368 rule).
   */
  private recordStop(answer: AutomationStudioSubflowTrialResult): JsonObject | undefined {
    const signature = Stop.signature(answer);
    if (!signature) return undefined;
    const seen = this.stops.get(key(answer)) ?? new Set<string>();
    const repeated = seen.has(signature);
    seen.add(signature);
    this.stops.set(key(answer), seen);
    if (!repeated) return undefined;
    const stop = Stop.of(answer.feedback);
    this.repeatedFailures.set(key(answer), stop);
    return stop;
  }

  /** The judge's feedback when a proposal with this digest was judged no; undefined otherwise. */
  refuted(digest: string): JsonObject | undefined {
    const closed = this.closedDigests.get(digest);
    return closed ? structuredClone(closed) : undefined;
  }

  /** The partial verdict standing for this proposal, when it was tried. */
  standing(proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest"> | undefined): AutomationStudioSubflowTrialResult | undefined {
    const answer = proposal ? this.verdicts.get(key(proposal)) : undefined;
    return answer ? structuredClone(answer) : undefined;
  }

  /**
   * A yes over flagged reads, as the row check leaves it (header, t692): the
   * yes where the port says the converse question confirmed it; else unsure.
   */
  private async checkRows(port: AutomationStudioSubflowTrialPreparingPort, yes: AutomationStudioSubflowTrialResult, reads: AutomationStudioSubflowTrialKeptEveryRowRead[], signal: AbortSignal): Promise<AutomationStudioSubflowTrialResult> {
    let raw: unknown;
    try {
      raw = port.checkRows ? await port.checkRows({ scope: structuredClone(this.input.scope), revision: yes.revision, digest: yes.digest, ...(yes.trialRunId ? { trialRunId: yes.trialRunId } : {}), reads: structuredClone(reads), signal }) : undefined;
    } catch (error) {
      if (signal.aborted) throw error;
      // A check that failed confirms nothing; its error text is never shown.
      raw = undefined;
    }
    const flagged = reads.map((read) => ({ read: read.nodeId, said: read.keptEveryRow.said }));
    const confirmed = isJsonObject(raw) && raw.converse === "confirmed";
    if (confirmed) return { ...yes, feedback: { ...yes.feedback, keptEveryRow: flagged, rowCheck: ROW_CHECK_WORDS.confirmed } };
    return { ...yes, verdict: "unsure", feedback: { ...yes.feedback, code: ROWS_UNACCOUNTED, keptEveryRow: flagged, rowCheck: ROW_CHECK_WORDS.unconfirmed } };
  }

  /** The trial's answer as the gate keeps it, and Core's record of a no it carried beside it, unread (header, t633). */
  private async ask(port: AutomationStudioSubflowTrialPort, latest: AutomationStudioSubflowProposal, signal: AbortSignal, startedWith: readonly string[]): Promise<{ answer: AutomationStudioSubflowTrialResult; standingNo?: unknown; keptConditions?: AutomationStudioResultKeptCondition[]; keptEveryRow?: AutomationStudioSubflowTrialKeptEveryRowRead[]; notRun?: AutomationStudioSubflowTrialNotRun["notRun"] }> {
    const scope = this.input.scope;
    const identity: AutomationStudioSubflowScopeIdentity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
    const failed = (code: string): { answer: AutomationStudioSubflowTrialResult } => ({ answer: { partial: true, scope: "subflow", identity: { ...identity }, revision: latest.revision, digest: latest.digest, verdict: "execution_failed", feedback: { code }, entryPrepared: false } });
    let raw: unknown;
    try {
      raw = await port({ scope: structuredClone(scope), proposal: deepFreeze(structuredClone(latest)), signal, ...(startedWith.length ? { startedWith: [...startedWith] } : {}) });
    } catch (error) {
      if (signal.aborted) throw error;
      // The port's own error text may carry page or account detail, so the model is told only its kind (header, lane 3).
      return { answer: { ...failed("subflow.trial_port_failed").answer, feedback: Stop.portFailed("subflow.trial_port_failed", error) } };
    }
    // A trial the port did not run, said as the port says it (header, t679).
    const notRun = notRunOf(raw);
    if (notRun) return { answer: failed("subflow.trial_not_run").answer, notRun };
    const result = raw as Partial<AutomationStudioSubflowTrialResult> | null;
    if (!result || typeof result !== "object" || result.partial !== true || result.scope !== "subflow" || typeof result.entryPrepared !== "boolean"
      || !(AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS as readonly unknown[]).includes(result.verdict) || !isJsonObject(result.feedback)
      || (result.trialRunId !== undefined && typeof result.trialRunId !== "string")) return failed("subflow.trial_result_invalid");
    // A verdict about another brief, plan, subflow, revision or digest is no verdict about this one.
    const said = result.identity;
    if (!said || said.buildId !== identity.buildId || said.briefId !== identity.briefId || said.planDigest !== identity.planDigest || said.subflowKey !== identity.subflowKey
      || result.revision !== latest.revision || result.digest !== latest.digest) return failed("subflow.trial_result_mismatch");
    const kept: AutomationStudioSubflowTrialResult = { partial: true, scope: "subflow", identity: { ...identity }, revision: latest.revision, digest: latest.digest, verdict: result.verdict!, feedback: structuredClone(result.feedback), entryPrepared: result.entryPrepared };
    if (result.trialRunId) kept.trialRunId = result.trialRunId;
    if (Array.isArray(result.acts) && result.acts.length) kept.acts = structuredClone(result.acts);
    const standingNo = (result as { standingNo?: unknown }).standingNo;
    // Kept conditions another gate found, where the port carries them (header, t689).
    const carried = carriedKept((result as AutomationStudioResultKeptConditionsCarrier).keptConditions);
    // The reads Core flagged, where the port carries them (header, t692).
    const flagged = flaggedReads((result as { keptEveryRow?: unknown }).keptEveryRow);
    return { answer: kept, ...(standingNo !== undefined ? { standingNo } : {}), ...(carried ? { keptConditions: carried } : {}), ...(flagged.length ? { keptEveryRow: flagged } : {}) };
  }
}

/** The flagged reads a port's result carries (header, t692): copies of the entries of their shape. */
function flaggedReads(value: unknown): AutomationStudioSubflowTrialKeptEveryRowRead[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AutomationStudioSubflowTrialKeptEveryRowRead[] => {
    if (!isJsonObject(entry) || typeof entry.nodeId !== "string" || !Number.isSafeInteger(entry.kept) || (entry.kept as number) < 1) return [];
    const flag = entry.keptEveryRow;
    return isJsonObject(flag) && typeof flag.said === "string" && flag.said ? [structuredClone(entry) as unknown as AutomationStudioSubflowTrialKeptEveryRowRead] : [];
  });
}

/** The kept conditions a port's result carries (header, t689): copies of the entries of their shape; undefined where it carries no list. */
function carriedKept(value: unknown): AutomationStudioResultKeptCondition[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry): AutomationStudioResultKeptCondition[] => {
    if (!isJsonObject(entry)) return [];
    const { name, revision, written, keptOut } = entry;
    return typeof name === "string" && Number.isSafeInteger(revision) && typeof written === "string" && Array.isArray(keptOut) && keptOut.length ? [structuredClone(entry) as unknown as AutomationStudioResultKeptCondition] : [];
  });
}

/** This gate's own kept conditions, then each carried one it does not keep as written already (header, t689). */
function withCarried(own: AutomationStudioResultKeptCondition[], carried: readonly AutomationStudioResultKeptCondition[]): AutomationStudioResultKeptCondition[] {
  const written = new Set(own.map((condition) => condition.written));
  return [...own, ...carried.filter((condition) => !written.has(condition.written)).map((condition) => structuredClone(condition))];
}

/** The port's own account of a trial it did not run (header, t679), when it gave a well-formed one; undefined otherwise. */
function notRunOf(raw: unknown): AutomationStudioSubflowTrialNotRun["notRun"] | undefined {
  const said = raw && typeof raw === "object" ? (raw as { notRun?: unknown }).notRun : undefined;
  if (!said || typeof said !== "object" || Array.isArray(said)) return undefined;
  const { code, instruction, detail, retry } = said as Record<string, unknown>;
  if (typeof code !== "string" || !code || typeof instruction !== "string" || !instruction) return undefined;
  return { code, instruction, ...(isJsonObject(detail) ? { detail: structuredClone(detail) } : {}), ...(retry === true ? { retry: true } : {}) };
}

/** What a trial's answer tells the builder to do next (header); `retestable`, whether this revision may still be tested again; `whole`, whether the test was the judged whole run (t679). */
function instructionFor(answer: AutomationStudioSubflowTrialResult, retestable: boolean, whole = false): string {
  // Core's own trial runner that failed is no subflow before this one that did (header, lane 3).
  const runner = answer.verdict === "execution_failed" && Stop.of(answer.feedback).kind === "trial_runner";
  if (!answer.entryPrepared && !runner) return ENTRY_NOT_PREPARED;
  // A control on the page but not shown: a step before it must show it, never a test of the same revision (header, t661).
  const notShown = automationStudioCandidateNotShownInstruction(answer, "submit the subflow with core.submit_subflow");
  if (notShown) return notShown;
  if (answer.verdict === "not_judged" && answer.feedback.yesUnconfirmed === true) return NOT_JUDGED_AFTER_YES;
  if (answer.verdict === "unsure" && retestable && typeof answer.feedback.contradictedByBuild === "string") return CONTRADICTED_RETESTABLE;
  // A yes the row check could not confirm (header, t692).
  if (answer.verdict === "unsure" && retestable && answer.feedback.code === ROWS_UNACCOUNTED) return ROWS_UNACCOUNTED_RETESTABLE;
  if (answer.verdict === "unsure" && retestable) {
    if (automationStudioCandidateRetestAdvised(answer)) return UNSURE_RETEST_ADVISED;
    // Core's record contradicts part of the no's reading: never said to contradict nothing (header, t652).
    if (automationStudioCandidateRecordContradictsPart(answer)) return UNSURE_PART_CONTRADICTED;
    // The yes's reading rides only on a split (header, t725).
    return isJsonObject(answer.feedback.answeredReading) ? UNSURE_SPLIT : UNSURE_RETESTABLE;
  }
  // What stopped it, after the verdict's own first sentence (header, lane 3).
  if (answer.verdict === "execution_failed") return Stop.instruction(answer, { head: EXECUTION_FAILED_HEAD, retestable, resubmit: RESUBMIT });
  return whole && answer.verdict === "yes" ? WHOLE_YES : INSTRUCTIONS[answer.verdict];
}

/** What the builder is told once a revision stopped the same way twice, by what stopped it (header, lane 3). */
function repeatedInstruction(stop: JsonObject): string {
  return stop.kind === "trial_runner" ? Stop.sameRunnerFailure(RESUBMIT) : `${String(stop.said)} ${SAME_FAILURE_INSTRUCTION}`;
}

function key(receipt: { revision: number; digest: string }): string { return `${receipt.revision}\n${receipt.digest}`; }

/** The answer with Core's own findings beside the trial's feedback, after any already there (header, t647). */
function withCoreFindings(answer: AutomationStudioSubflowTrialResult, found: readonly JsonObject[]): AutomationStudioSubflowTrialResult {
  const earlier = Array.isArray(answer.feedback.coreFindings) ? answer.feedback.coreFindings : [];
  return { ...answer, feedback: { ...answer.feedback, coreFindings: [...earlier, ...found] } };
}

/** A no the build's own record contradicts, kept as an unsure with Core's words beside the judge's (header, t633): its revision is not closed. */
function notTaken(answer: AutomationStudioSubflowTrialResult, contradiction: AutomationStudioResultStandingNoContradiction): AutomationStudioSubflowTrialResult {
  const said = contradiction.revision < 1 ? earlierBriefSaid(contradiction) : contradiction.said;
  return { ...answer, verdict: "unsure", feedback: { ...answer.feedback, contradictedByBuild: said } };
}

/**
 * Core's words for a no an earlier brief's standing no contradicts (header,
 * t634): as `../../result-verification/standing-no/contradiction.ts` says it,
 * but naming the revision as an earlier brief's, since its number is not one
 * of this brief's. The conditions by Core's names and a count of rows, never
 * their labels. Generic words.
 */
function earlierBriefSaid(found: AutomationStudioResultStandingNoContradiction): string {
  const { conditions, rows } = found;
  const them = conditions.length === 1 ? conditions[0]! : `${conditions.slice(0, -1).join(", ")} and ${conditions.at(-1)!}`;
  const what = rows === 1 ? "a row" : `${rows} rows`;
  const it = rows === 1 ? "it" : "them";
  return `Core's record of this build contradicts this no. A revision of this subflow that an earlier brief tested, read without ${them}, stored ${what} that the no standing on its trial called not the kind of thing the request asks for; `
    + `this revision reads with ${conditions.length === 1 ? "it" : "them"} and stores none of ${it}. Removing ${them}, as this no asks, would bring back exactly what answered that earlier no, `
    + "so this no is not taken: the verdict is unsure, not no.";
}

/** An act as the model is shown it: its id, what it did, and the call that made it. */
function namedAct(act: AutomationStudioSiteResetNamedAct): JsonObject {
  return { act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}) };
}

function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, instruction, ...detail }, effectApplied: false, targetsUnchanged: true, resultCode: code };
}

function refusal(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction, ...detail } };
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}
