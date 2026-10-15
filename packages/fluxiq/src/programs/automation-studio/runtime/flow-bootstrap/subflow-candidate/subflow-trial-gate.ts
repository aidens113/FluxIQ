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
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION,
  AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS,
  automationStudioCandidateRetestAdvised,
  automationStudioCandidateStartedWithSaid,
  type AutomationStudioCandidateTrialPrepared,
  type AutomationStudioCandidateTrialVerdict
} from "../candidate/index.ts";
// Its own barrel, not result-verification's, whose reads import flow-bootstrap back (a module cycle).
import {
  AutomationStudioResultKeptConditionMemory,
  AutomationStudioResultStandingNoMemory,
  type AutomationStudioResultKeptConditionsCarrier,
  type AutomationStudioResultStandingNoContradiction
} from "../../result-verification/standing-no/index.ts";
import type { AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";
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
 * (`../../result-verification/agreement.ts`, `../../result-verification/verdict.ts`).
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

/**
 * Said for a no the build's own record contradicts while the revision may
 * still be tested (header, t633): why it is not taken, and to test again
 * rather than make its change. Generic words.
 */
const CONTRADICTED_RETESTABLE = "The judge answered no, but Core's record of this build contradicts that no (contradictedByBuild in the feedback says how): the change it asks for would bring back rows that an earlier no of this subflow, which stood, called not what the parts ask for. "
  + "So that no is not taken: this revision is unsure, not closed. Test this same revision again, with the same revision and digest (retestsLeft says how many times), and do not make the change that no asks for. "
  + "Change the subflow only for a defect the trial's own reads, steps and stored rows show, submit it with core.submit_subflow, then test the new revision.";

/** Said instead when a predecessor did not run to its end: the target never started where it should. */
const ENTRY_NOT_PREPARED = "A subflow that runs before this one did not run to its end, so this subflow did not start from its prepared entry and the verdict says nothing about it. Test this revision again; if it keeps failing there, complete with outcome blocked and say why.";

/** The model-facing partial test tool and the builder's completion rule bound to its verdicts. */
export class AutomationStudioSubflowTrialGate {
  readonly tool: AutomationStudioLlmEvidenceTool = {
    toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, effect: "mutate",
    description: "Ask Core to try your latest submitted subflow once, on its own with no model: from the start page, it runs the subflows before this one to reach its entry, runs this subflow with its inputs, and judges it against its parts and success check. Give that proposal's revision and digest exactly. The answer is a partial verdict (yes, no, unsure, not_judged or execution_failed) with feedback; it counts for this brief only. The run acts on the site like the saved subflow would. Before a trial, put the site back the way this build found it: if this answers candidate.trial_reset_required, undo the acts it lists, then test again; an act the site offers no control to undo goes under cannotUndo, and the trial runs with it already done. Complete only after a yes for that exact revision and digest. If it answers subflow.trial_unavailable, no trial can run here.",
    inputSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" },
      cannotUndo: { type: "array", maxItems: 50, items: { type: "string", pattern: "^act-[1-9][0-9]{0,3}$" }, description: "Only after candidate.trial_reset_required listed them: the acts the site offers no control to undo. The trial then runs with them already done, and the judge is told." } },
    required: ["revision", "digest"], additionalProperties: false }
  };
  /** Each trial's answer as kept, with the kept conditions as of that trial (header, t641): what `standing` hands the submission controller. */
  private readonly verdicts = new Map<string, AutomationStudioSubflowTrialResult & AutomationStudioResultKeptConditionsCarrier>();
  private readonly closedDigests = new Map<string, JsonObject>();
  private readonly trials = new Map<string, number>();
  /** The brief's standing nos that upheld rows of a kind, for a later no to be held to (header, t633). */
  private readonly standingNos = new AutomationStudioResultStandingNoMemory();
  /** The conditions Core's record showed keep out only rows the request does not ask for (header, t641). */
  private readonly keptConditions = new AutomationStudioResultKeptConditionMemory();
  private readonly fallbackSignal = new AbortController().signal;

  constructor(private readonly input: {
    scope: AutomationStudioSubflowScope;
    latest: () => AutomationStudioSubflowProposal | undefined;
    port?: AutomationStudioSubflowTrialPreparingPort | undefined;
    signal?: AbortSignal | undefined;
    /** The site reset before each trial (header): the brief's ledger and start check. Absent, a trial runs on the site as it stands. */
    reset?: AutomationStudioSiteResetTrialReset | undefined;
  }) {
    if (input.port !== undefined && typeof input.port !== "function") throw new Error("subflow.trial_port_invalid");
    // Earlier briefs' standing nos, at revisions below 1, oldest first (header, t634).
    const earlier = Array.isArray(input.port?.standingNos) ? input.port.standingNos : [];
    earlier.forEach((standingNo, index) => this.standingNos.weigh({ revision: index - earlier.length, verdict: "no", standingNo }));
  }

  get available(): boolean { return this.input.port !== undefined; }

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
    if (!latest) return refused("subflow.trial_stale_revision", "There is no valid latest proposal to test. Submit this subflow with core.submit_subflow, then test the revision and digest it returns.");
    if (latest.revision !== revision || latest.digest !== digest) return refused("subflow.trial_stale_revision", "Only the latest proposal can be tested. Test the revision and digest given here.", { latestRevision: latest.revision, latestDigest: latest.digest });
    const closed = this.closedDigests.get(latest.digest);
    if (closed) return refused("subflow.trial_unchanged_after_no", "This exact proposal was already tried and judged no. Change it to address that feedback, submit it, then test the new revision.", { previousFeedback: closed });
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
    const absorbed = reset?.kind === "admit" ? (reset.absorbedByStartReset ?? []).map(namedAct) : [];
    this.trials.set(key(latest), tried + 1);
    const asked = await this.ask(port, latest, signal, reset?.kind === "admit" ? automationStudioCandidateStartedWithSaid(reset.startedWith) : []);
    // A no whose remedy would take back what an earlier standing no of this subflow upheld is not taken (header, t633, t634).
    const contradiction = asked.answer.entryPrepared ? this.standingNos.weigh({ revision: asked.answer.revision, verdict: asked.answer.verdict, standingNo: asked.standingNo }) : undefined;
    const answer = contradiction ? notTaken(asked.answer, contradiction) : asked.answer;
    // The port is told the gate's verdict, even of a trial a stop then cuts short (header, t634).
    const stood = answer.verdict === "no" && answer.entryPrepared && asked.standingNo !== undefined;
    port.weighed?.({ answer: structuredClone(answer), ...(stood ? { standingNo: structuredClone(asked.standingNo) } : {}) });
    signal.throwIfAborted();
    const leftOnSite = this.input.reset?.trialRan(answer.acts ?? [], answer.trialRunId);
    // What Core's record of this trial shows its conditions kept out, as the proposal that ran wrote them (header, t641).
    if (answer.entryPrepared) this.keptConditions.remember({ revision: answer.revision, standingNo: asked.standingNo, plan: latest.subflows ? { subflows: latest.subflows } : undefined });
    const keptConditions = this.keptConditions.conditions();
    this.verdicts.set(key(answer), keptConditions.length ? { ...answer, keptConditions } : answer);
    if (answer.verdict === "no" && answer.entryPrepared) this.closedDigests.set(answer.digest, answer.feedback);
    const retestsLeft = TRANSIENT.has(answer.verdict) || !answer.entryPrepared ? AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION - (tried + 1) : 0;
    const evidence: JsonObject = {
      ok: answer.verdict === "yes", partial: true, verdict: answer.verdict, subflowKey: answer.identity.subflowKey, revision: answer.revision, digest: answer.digest,
      entryPrepared: answer.entryPrepared, feedback: answer.feedback, promotionCredit: false,
      instruction: instructionFor(answer, retestsLeft > 0),
      ...(reset?.kind === "admit" && reset.startedWith ? { startedWith: reset.startedWith } : {}),
      ...(absorbed.length ? { absorbedByStartReset: absorbed } : {}),
      ...(leftOnSite?.length ? { leftOnSite: leftOnSite.map(namedAct) } : {})
    };
    if (answer.trialRunId) evidence.trialRunId = answer.trialRunId;
    if (TRANSIENT.has(answer.verdict) || !answer.entryPrepared) evidence.retestsLeft = retestsLeft;
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
    const retestable = (this.trials.get(key(receipt)) ?? 0) < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION;
    const advised = answer.verdict === "unsure" && answer.entryPrepared && retestable && typeof answer.feedback.contradictedByBuild !== "string" ? { retestAdvised: automationStudioCandidateRetestAdvised(answer) } : {};
    return refusal(`subflow.trial_${answer.verdict}`, instructionFor(answer, retestable), { verdict: answer.verdict, entryPrepared: answer.entryPrepared, trialFeedback: answer.feedback, ...advised });
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

  /** The trial's answer as the gate keeps it, and Core's record of a no it carried beside it, unread (header, t633). */
  private async ask(port: AutomationStudioSubflowTrialPort, latest: AutomationStudioSubflowProposal, signal: AbortSignal, startedWith: readonly string[]): Promise<{ answer: AutomationStudioSubflowTrialResult; standingNo?: unknown }> {
    const scope = this.input.scope;
    const identity: AutomationStudioSubflowScopeIdentity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
    const failed = (code: string): { answer: AutomationStudioSubflowTrialResult } => ({ answer: { partial: true, scope: "subflow", identity: { ...identity }, revision: latest.revision, digest: latest.digest, verdict: "execution_failed", feedback: { code }, entryPrepared: false } });
    let raw: unknown;
    try {
      raw = await port({ scope: structuredClone(scope), proposal: deepFreeze(structuredClone(latest)), signal, ...(startedWith.length ? { startedWith: [...startedWith] } : {}) });
    } catch (error) {
      if (signal.aborted) throw error;
      // The port's own error text may carry page or account detail, so the model is told only that it failed.
      return failed("subflow.trial_port_failed");
    }
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
    return { answer: kept, ...(standingNo !== undefined ? { standingNo } : {}) };
  }
}

/** What a trial's answer tells the builder to do next (header); `retestable`, whether this revision may still be tested again. */
function instructionFor(answer: AutomationStudioSubflowTrialResult, retestable: boolean): string {
  if (!answer.entryPrepared) return ENTRY_NOT_PREPARED;
  if (answer.verdict === "not_judged" && answer.feedback.yesUnconfirmed === true) return NOT_JUDGED_AFTER_YES;
  if (answer.verdict === "unsure" && retestable && typeof answer.feedback.contradictedByBuild === "string") return CONTRADICTED_RETESTABLE;
  if (answer.verdict === "unsure" && retestable) return automationStudioCandidateRetestAdvised(answer) ? UNSURE_RETEST_ADVISED : UNSURE_RETESTABLE;
  return INSTRUCTIONS[answer.verdict];
}

function key(receipt: { revision: number; digest: string }): string { return `${receipt.revision}\n${receipt.digest}`; }

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
