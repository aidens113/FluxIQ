// A partial receipt belongs to its exact brief, proposal revision and digest.
// A yes can finish that brief; it never promotes the whole Flow.
//
// Validation and repair checks precede admission. The original gate invocation
// is then observed on the continuation's configured trial series before reset,
// start, or execution. An existing admitted parent is forwarded as a child.
// Unknown collaborators preserve the first result without closing coverage.
//
// A genuine pinned diagnosis runs only its retained-evidence owner. Offline
// labels and live-or-cache callbacks do not grant read-only authority. Such
// diagnosis runs no start or reset and earns no whole-run promotion credit.
//
// Each revision keeps its bounded retests, repeated execution failures and
// standing-no/kept-condition evidence. From-step runs only check repairs.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioLlmStepLogReset } from "../../llm/step-log/index.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION,
  AUTOMATION_STUDIO_CANDIDATE_OFFLINE_YES_INSTRUCTION,
  AutomationStudioCandidateEarlierAdviceMemory,
  automationStudioCandidateNotShownInstruction,
  automationStudioCandidateRecordContradictsPart,
  automationStudioCandidateRetestAdvised,
  automationStudioCandidateStartedWithSaid, automationStudioTrialDefaultsBeforeTrial,
  automationStudioCandidateTrialOffline,
  automationStudioCandidateTrialStop as Stop,
  type AutomationStudioCandidateEarlierAdviceTrial,
  type AutomationStudioCandidateTrialPrepared,
  type AutomationStudioCandidateTrialVerdict
} from "../candidate/index.ts";
// Its own barrel, not result-verification's, whose reads import flow-bootstrap back (a module cycle).
import {
  AutomationStudioResultKeptConditionMemory,
  AutomationStudioResultStandingNoMemory,
  type AutomationStudioResultKeptCondition,
  type AutomationStudioResultKeptConditionsCarrier
} from "../../result-verification/standing-no/index.ts";
import type { AutomationStudioResultKeptEveryRow } from "../../result-verification/contracts/index.ts";
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as OFFLINE_WORDS } from "../offline-first/index.ts";
import { automationStudioSiteResetExploredOnAbsorbed, type AutomationStudioSiteResetNamedAct, type AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";
import { automationStudioTrialChangeContradictedNo, automationStudioTrialChangeSteps, type AutomationStudioTrialChangeOutcome, type AutomationStudioTrialChangeSession } from "../trial-change/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowScopeIdentity, AutomationStudioSubflowTrialPort, AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "./contracts.ts";
import { automationStudioSubflowContradictedNo } from "./contradicted-no.ts";
import { automationStudioSubflowFromStepRun } from "./from-step-run.ts";
import { AutomationStudioSubflowPendingRepair } from "./pending-repair.ts";
import { AUTOMATION_STUDIO_SUBFLOW_REPAIR_WORDS as REPAIR_WORDS } from "./repair-words.ts";
import { automationStudioSubflowTrialOfflineFirstCheck } from "./subflow-trial-offline-first.ts";
import { automationStudioSubflowTrialResultRead } from "./subflow-trial-result.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_INPUT as TEST_INPUT } from "./test-input.ts";
import { PartialTrialAdmission, inheritPartialTrialContext, invokePartialTrialPort, isPartialTrialReadOnly, observePartialTrialCallback } from "../../candidate-trials/partial/index.ts";
import { finishAutomationStudioSiteResetSession, observeAutomationStudioTrialPolicy, observeAutomationStudioTrialResultPolicy } from "../reset-observation/index.ts";

/**
 * A partial trial port that can run the deployment's start hook ahead of the
 * gate's reset check (header), as a whole candidate's port can
 * (`AutomationStudioCandidateTrialPort["prepareStart"]`). The trial of that
 * brief, revision and digest that follows uses that start and does not run
 * the hook again.
 */
export type AutomationStudioSubflowTrialPreparingPort = AutomationStudioSubflowTrialPort & {
  /** Core's predecessors that the trial runs before its own proposal; checked before preparing the site. */
  admissionPredecessors?: ((scope: AutomationStudioSubflowScope) => readonly { nodes: readonly AutomationStudioFlowBootstrapNode[] }[] | Promise<readonly { nodes: readonly AutomationStudioFlowBootstrapNode[] }[]>) | undefined;
  prepareStart?: ((input: { scope: AutomationStudioSubflowScope; revision: number; digest: string; signal: AbortSignal }) => Promise<AutomationStudioCandidateTrialPrepared>) | undefined;
  /** The standing nos earlier briefs of this subflow kept in this build, oldest first, read once as the gate is made (header, t634). Core-only. */
  standingNos?: readonly unknown[] | undefined;
  /** The judged trials' advice earlier briefs of this subflow kept in this build, oldest first, read once as the gate is made (header, t752). Core-only. */
  earlierTrials?: readonly unknown[] | undefined;
  /** Told each trial the gate asked, as the gate weighed it (header, t634). */
  weighed?: ((trial: AutomationStudioSubflowTrialWeighed) => unknown) | undefined;
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
  /** The advice the gate kept of this trial, for a later brief of the subflow (header, t752); absent where it kept none. */
  advised?: AutomationStudioCandidateEarlierAdviceTrial;
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
const RESET_WORDS = "The trial runs on the site as it stands: what this build already did there stays, the judge is told it, and the trial is judged by what it changed from the state just before it. If this answers candidate.trial_starts_in_end_state, undo just the act it lists, then test again.";
const SUBFLOW_DESCRIPTION = "Ask Core to try your latest submitted subflow once, on its own with no model: from the start page, it runs the subflows before this one to reach its entry, runs this subflow with its inputs, and judges it against its parts and success check. Leave revision and digest out to test your latest submitted proposal, or give both exactly as core.submit_subflow returned them; a pair that is not the latest is refused. The answer is a partial verdict (yes, no, unsure, not_judged or execution_failed) with feedback; it counts for this brief only. The run acts on the site like the saved subflow would. "
  + `${RESET_WORDS} Complete only after a yes for that exact revision and digest. If it answers subflow.trial_unavailable, no trial can run here.`;
const WHOLE_DESCRIPTION = "Ask Core to test your latest submitted subflow as the whole Flow: the plan is your one subflow, so Core joins it into the whole Flow and runs that once from its start with no model, and the judge says whether the run did what the person asked. This test is the build's judged run: a yes completes this brief, and the supervisor completes the Flow on it. "
  + "Leave revision and digest out to test your latest submitted proposal, or give both exactly as core.submit_subflow returned them; a pair that is not the latest is refused. The answer is a verdict (yes, no, unsure, not_judged or execution_failed) with feedback. The run acts on the site like the saved Flow would. "
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

/** The code of a whole test, or a completion, refused while a failed test's repair is unchecked (header, t804). */
const FROM_STEP_FIRST = "subflow.trial_from_step_first";

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
  /** The repair a failed whole test left standing, checked from its failing step (header, t804). */
  private readonly repair: AutomationStudioSubflowPendingRepair;
  /** Each trial's answer as kept, with the kept conditions as of that trial (header, t641): what `standing` hands the submission controller. */
  private readonly verdicts = new Map<string, AutomationStudioSubflowTrialResult & AutomationStudioResultKeptConditionsCarrier>();
  private readonly closedDigests = new Map<string, JsonObject>();
  private readonly trials = new Map<string, number>();
  /** The revisions and digests whose offline-first check was asked: at most once each (header, P6; D41). */
  private readonly offlineAsked = new Set<string>();
  /** How each revision's execution-failed trials stopped, and the revisions that stopped the same way twice, with what stopped them (header, lane 3). */
  private readonly stops = new Map<string, Set<string>>();
  private readonly repeatedFailures = new Map<string, JsonObject>();
  /** The brief's standing nos that upheld rows of a kind, for a later no to be held to (header, t633). */
  private readonly standingNos = new AutomationStudioResultStandingNoMemory();
  /** The conditions Core's record showed keep out only rows the request does not ask for (header, t641). */
  private readonly keptConditions = new AutomationStudioResultKeptConditionMemory();
  /** The kept conditions the latest prepared trial's port carried, found by another gate (header, t689). */
  private carriedKept: AutomationStudioResultKeptCondition[] = [];
  /** Each judged trial's advice, earlier briefs' first, for the judge of a later revision's trial (header, t752). */
  private readonly earlierAdvice: AutomationStudioCandidateEarlierAdviceMemory;
  private readonly fallbackSignal = new AbortController().signal;
  private readonly execution: PartialTrialAdmission | undefined;

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
    /** The repair memory of this subflow, which a caller hands each brief of it (header, t804). Absent, the gate keeps its own. */
    pendingRepair?: AutomationStudioSubflowPendingRepair | undefined;
  }) {
    const fromStep = typeof input.port?.fromStep === "function";
    this.tool = { toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, effect: "mutate", description: `${input.whole ? WHOLE_DESCRIPTION : SUBFLOW_DESCRIPTION}${fromStep ? ` ${REPAIR_WORDS.description}` : ""}`, inputSchema: TEST_INPUT.schema(fromStep) };
    this.repair = input.pendingRepair ?? new AutomationStudioSubflowPendingRepair();
    if (input.port !== undefined && typeof input.port !== "function") throw new Error("subflow.trial_port_invalid");
    this.execution = input.port ? new PartialTrialAdmission(this, input.port) : undefined;
    // Earlier briefs' standing nos, at revisions below 1, oldest first (header, t634).
    const earlier = Array.isArray(input.port?.standingNos) ? input.port.standingNos : [];
    earlier.forEach((standingNo, index) => this.standingNos.weigh({ revision: index - earlier.length, verdict: "no", standingNo }));
    this.earlierAdvice = new AutomationStudioCandidateEarlierAdviceMemory(Array.isArray(input.port?.earlierTrials) ? input.port.earlierTrials : []);
  }

  get available(): boolean { return this.input.port !== undefined; }

  /** What a stale refusal says first of a revision at or below the one this brief starts from (header, t658); nothing for any other. */
  private earlierBrief(revision: number): string {
    const after = this.input.revisionsAfter;
    if (after === undefined || revision < 1 || revision > after) return "";
    return `Revision ${revision} is not one of this brief's: it is an earlier brief's, the one this brief was shown and starts from, and it cannot be tested here. This brief's own revisions are numbered on from ${after}. `;
  }

  async test(value: JsonObject, callSignal?: AbortSignal): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const read = TEST_INPUT.read(value, typeof this.input.port?.fromStep === "function");
    if (!read.ok) return refused(read.code, read.instruction);
    const { revision, digest, cannotUndo } = read.call;
    const port = this.input.port;
    if (!port) return refused("subflow.trial_unavailable", "No subflow trial runner is available here. Complete with the latest subflowKey, revision and digest; the proposal stays untried.");
    const latest = this.input.latest();
    // A revision at or below the one this brief starts from is an earlier brief's, said so beside this brief's own (header, t658).
    const earlier = revision === undefined ? "" : this.earlierBrief(revision);
    if (!latest) return refused("subflow.trial_stale_revision", `${earlier}There is no valid latest proposal to test. Submit this subflow with core.submit_subflow, then test the revision and digest it returns.`, earlier && revision !== undefined ? { earlierRevision: revision } : {});
    if (revision !== undefined && (latest.revision !== revision || latest.digest !== digest)) {
      return refused("subflow.trial_stale_revision", `${earlier}Only the latest proposal can be tested. Test the revision and digest given here.`, { latestRevision: latest.revision, latestDigest: latest.digest, ...(earlier ? { earlierRevision: revision } : {}) });
    }
    // A run from a step checks a repair, on the page as it stands; it is never the part's test (header, t804).
    if (read.call.from !== undefined && port.fromStep) {
      const request = this.request(latest, callSignal ?? this.input.signal ?? this.fallbackSignal, []);
      return await this.execution!.run(request, { receiver: this, callback: this.performFromStep, args: [request, read.call.from] }, true);
    }
    const closed = this.closedDigests.get(latest.digest);
    if (closed) return refused("subflow.trial_unchanged_after_no", "This exact proposal was already tried and judged no. Change it to address that feedback, submit it, then test the new revision.", { previousFeedback: closed });
    const repeated = this.repeatedFailures.get(key(latest));
    if (repeated) return refused("subflow.trial_same_failure", repeatedInstruction(repeated), { failedStep: repeated });
    const tried = this.trials.get(key(latest)) ?? 0;
    if (tried >= AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION) {
      return refused("subflow.trial_retest_limit", `This exact revision has been tested ${tried} times without a yes, so it is not tested again. Change the step the last feedback names, submit the subflow, then test the new revision.`, { trials: tried, maxTrials: AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION });
    }
    // A failed test's repair is checked from its failing step before the whole part is tested again (header, t804).
    const pending = port.fromStep ? this.repair.refuses(latest, read.call.fromStepImpossible) : undefined;
    if (pending) return refused(FROM_STEP_FIRST, REPAIR_WORDS.refused(pending.step, latest), pending.step ? { repairStep: pending.step.key } : {});
    const signal = callSignal ?? this.input.signal ?? this.fallbackSignal;
    const request = this.request(latest, signal, []);
    return await this.execution!.run(request, { receiver: this, callback: this.performTrial, args: [request, cannotUndo, tried] });
  }

  private async performTrial(request: AutomationStudioSubflowTrialRequest, cannotUndo: unknown, tried: number): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const { proposal: latest, signal } = request;
    const port = this.input.port!;
    const readOnly = isPartialTrialReadOnly(request);
    signal.throwIfAborted();
    // A revision's first test asks whether the recording already shows it failing, before anything is done on the site; once,
    // even where a refusal before the trial left it uncounted (header, P6).
    const askOffline = !readOnly && tried === 0 && port.offlineFirst !== undefined && !this.offlineAsked.has(key(latest));
    if (askOffline) this.offlineAsked.add(key(latest));
    const first = askOffline && port.offlineFirst ? await automationStudioSubflowTrialOfflineFirstCheck({ offlineFirst: input => observePartialTrialCallback(request, { receiver: port, callback: port.offlineFirst!, args: [input] }, signal, input), request: this.request(latest, signal, [], this.adviceFor(latest), request.scope), identity: this.identity(request.scope), trialToolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID }) : undefined;
    signal.throwIfAborted();
    const kept = first?.kind === "keep" ? first : undefined;
    // An offline trial, or a failure the recording showed, has no live effects: no start hook, no reset, nothing left on the site (header, Decision 6).
    const offline = automationStudioCandidateTrialOffline(port);
    const siteless = offline || kept !== undefined || readOnly;
    const resetOwner = this.input.reset;
    const admit = resetOwner?.admit;
    const policySteps = siteless || !admit ? [] : automationStudioSiteResetTrialSteps([...await this.predecessors(request, port), ...latest.subflows]);
    const admission = siteless || !resetOwner || !admit ? undefined : await observeAutomationStudioTrialPolicy(request, "reset", { receiver: resetOwner, callback: admit, args: [policySteps] }, policySteps);
    if (admission?.kind === "refuse") return { kind: "llm_evidence_tool_execution", evidence: admission.evidence, effectApplied: false, targetsUnchanged: true, resultCode: admission.evidence.code, resultReason: RETEST_REASON };
    const unwitnessed = !siteless && admission?.kind === "admit" ? admission.unwitnessed : undefined;
    // The deployment's start hook first, so the check after it finds the site put back (header).
    const startRequest = { scope: structuredClone(request.scope), revision: latest.revision, digest: latest.digest, signal };
    const prepared = !siteless && resetOwner && port.prepareStart ? await observePartialTrialCallback(request, { receiver: port, callback: port.prepareStart, args: [startRequest] }, signal, startRequest) : "none";
    signal.throwIfAborted();
    // The check is timed as its own reset step, so a trial's window no longer hides it (header, t737).
    const siteReset = siteless ? undefined : this.input.reset;
    // The trial's steps and the brief's parts, for its readings and the one targeted refusal (header, t775): the entry's steps serve no part.
    const own = request.scope.parts.map((part) => part.partId);
    const steps = readOnly ? [] : [...automationStudioTrialChangeSteps(await this.predecessors(request, port)), ...automationStudioTrialChangeSteps(latest.subflows, () => own)].map((step, index) => ({ ...step, step: index + 1 }));
    const change = { steps, parts: request.scope.parts.map((part) => ({ id: part.partId, ...(part.effect ? { effect: structuredClone(part.effect) } : {}) })) };
    const reset = siteReset && await automationStudioLlmStepLogReset({ stage: "site_check", trialToolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID },
      () => automationStudioTrialDefaultsBeforeTrial(siteReset, signal, cannotUndo, { ...(prepared === "reset" ? { startReset: true } : {}), change }, request), (decision) => decision.kind);
    signal.throwIfAborted();
    // Not a trial: the model is told what to put back, and the identical test after it reaches this gate again (header).
    if (reset?.kind === "refuse") return { kind: "llm_evidence_tool_execution", evidence: reset.evidence, effectApplied: reset.moved, targetsUnchanged: !reset.moved, resultCode: reset.evidence.code, resultReason: RETEST_REASON };
    // What the hook took back before this trial is answered with it, whatever the trial then answers.
    const absorbedActs = reset?.kind === "admit" ? reset.absorbedByStartReset ?? [] : [];
    const absorbed = absorbedActs.map(namedAct);
    this.trials.set(key(latest), tried + 1);
    const asked = kept?.asked ?? await this.ask(port, latest, signal, reset?.kind === "admit" ? automationStudioCandidateStartedWithSaid(reset.startedWith) : [], this.adviceFor(latest), reset?.kind === "admit" ? reset.change : undefined, request);
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
    // The port's answer came from the recording: said and kept as this gate's own kept answer (header, P6 D48).
    const recorded = readOnly || (!kept && asked.answer.checkedAgainst === "recorded_run");
    // A yes over a read that kept every item it saw after an act over a narrower read is asked again with a row check (header, t692).
    if (!readOnly && asked.answer.verdict === "yes" && asked.answer.entryPrepared && asked.keptEveryRow?.length) {
      asked.answer = await this.checkRows(port, asked.answer, asked.keptEveryRow, signal, request);
      signal.throwIfAborted();
    }
    // A no whose remedy would take back what an earlier standing no of this subflow upheld is not taken (header, t633, t634).
    const contradiction = asked.answer.entryPrepared ? this.standingNos.weigh({ revision: asked.answer.revision, verdict: asked.answer.verdict, standingNo: asked.standingNo }) : undefined;
    const weighedAnswer = contradiction ? automationStudioSubflowContradictedNo(asked.answer, contradiction) : asked.answer;
    // The page this brief explored was changed by an act the start took back and no step does (header, t647).
    const explored = weighedAnswer.verdict !== "yes" && weighedAnswer.entryPrepared
      ? automationStudioSiteResetExploredOnAbsorbed({ absorbed: absorbedActs, owner: request.scope.briefId, steps: (latest.subflows ?? []).flatMap((subflow) => subflow.nodes ?? []), ran: weighedAnswer.acts, whose: "subflow" })
      : [];
    // An execution-failed trial says what stopped it, in its own feedback (header, lane 3).
    const answer = Stop.told(explored.length ? withCoreFindings(weighedAnswer, explored) : weighedAnswer);
    // The port is told the gate's verdict, even of a trial a stop then cuts short (header, t634).
    const stood = answer.verdict === "no" && answer.entryPrepared && asked.standingNo !== undefined;
    const advised = answer.entryPrepared ? this.earlierAdvice.remember({ revision: answer.revision, verdict: answer.verdict, feedback: answer.feedback, standingNo: asked.standingNo, plan: latest.subflows ? { subflows: latest.subflows } : undefined }) : undefined;
    if (!readOnly && port.weighed) {
      const weighed = { answer: structuredClone(answer), ...(stood ? { standingNo: structuredClone(asked.standingNo) } : {}), ...(advised ? { advised } : {}) };
      await observeAutomationStudioTrialResultPolicy(request, { receiver: port, callback: port.weighed, args: [weighed] }, weighed);
    }
    signal.throwIfAborted();
    const landed = answer.acts ?? [];
    const leftOnSite = siteless || recorded || !resetOwner ? undefined : await observeAutomationStudioTrialResultPolicy(request, { receiver: resetOwner, callback: resetOwner.trialRan, args: [landed, answer.trialRunId] }, landed);
    // What Core's record of this trial shows its conditions kept out, as the proposal that ran wrote them (header, t641).
    if (answer.entryPrepared) this.keptConditions.remember({ revision: answer.revision, standingNo: asked.standingNo, plan: latest.subflows ? { subflows: latest.subflows } : undefined });
    // What another gate found, carried by the port, replaces what it carried before (header, t689).
    if (answer.entryPrepared && asked.keptConditions) this.carriedKept = asked.keptConditions;
    const keptConditions = withCarried(this.keptConditions.conditions(), this.carriedKept);
    // An offline yes is never the verdict kept for completion, and a stale one of this revision goes (header, Decision 3).
    const offlineYes = (offline || recorded) && answer.verdict === "yes";
    if (offlineYes && this.verdicts.get(key(answer))?.verdict !== "yes") this.verdicts.delete(key(answer));
    if (!offlineYes) this.verdicts.set(key(answer), keptConditions.length ? { ...answer, keptConditions } : answer);
    if (answer.verdict === "no" && answer.entryPrepared) this.closedDigests.set(answer.digest, answer.feedback);
    const repeatedStep = this.recordStop(answer);
    // A failed whole test leaves its repair standing, and its instruction says where (header, t804).
    const repairSet = (port.fromStep || this.repair.standing) && !offline && !readOnly ? this.repair.afterWholeTest(answer, latest) : undefined;
    const retestsLeft = !repeatedStep && (TRANSIENT.has(answer.verdict) || !answer.entryPrepared || offlineYes) ? AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION - (tried + 1) : 0;
    const evidence: JsonObject = {
      ok: answer.verdict === "yes" && !offlineYes, partial: true, verdict: answer.verdict, subflowKey: answer.identity.subflowKey, revision: answer.revision, digest: answer.digest,
      entryPrepared: answer.entryPrepared, feedback: answer.feedback, promotionCredit: false,
      instruction: `${kept ? `${kept.said} ` : recorded ? `${OFFLINE_WORDS.kept} ` : ""}${offlineYes ? AUTOMATION_STUDIO_CANDIDATE_OFFLINE_YES_INSTRUCTION : repeatedStep ? repeatedInstruction(repeatedStep) : instructionFor(answer, retestsLeft > 0, this.input.whole === true)}${repairSet ? ` ${REPAIR_WORDS.afterFailed(repairSet.step, repairSet.verdict)}` : ""}`,
      ...(repeatedStep ? { failedStep: repeatedStep } : {}),
      ...(reset?.kind === "admit" && reset.startedWith ? { startedWith: reset.startedWith } : {}),
      ...(unwitnessed ? { unwitnessed } : {}),
      ...(absorbed.length ? { absorbedByStartReset: absorbed } : {}),
      ...(leftOnSite?.length ? { leftOnSite: leftOnSite.map(namedAct) } : {}),
      // Checked against the recording, or the offline check's note for a trial run live (header, P6).
      ...(first ? structuredClone(first.evidence) : {}),
      ...(recorded ? { checkedAgainst: "recorded_run" } : {})
    };
    if (answer.trialRunId) evidence.trialRunId = answer.trialRunId;
    if (TRANSIENT.has(answer.verdict) || !answer.entryPrepared || repeatedStep || offlineYes) evidence.retestsLeft = retestsLeft;
    // Whether Core's record contradicts what kept an unsure from a yes: the fact its instruction rests on (header, t641).
    if (answer.verdict === "unsure" && answer.entryPrepared && retestsLeft > 0 && typeof answer.feedback.contradictedByBuild !== "string") evidence.retestAdvised = automationStudioCandidateRetestAdvised(answer);
    const answered: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence, effectApplied: !readOnly, targetsUnchanged: readOnly, resultCode: offlineYes ? "subflow.trial_offline_yes" : `subflow.trial_${answer.verdict}` };
    if (retestsLeft > 0) answered.resultReason = RETEST_REASON;
    return answered;
  }

  private async performFromStep(request: AutomationStudioSubflowTrialRequest, from: string): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const port = this.input.port!;
    const fromStep = port.fromStep!;
    const resetOwner = this.input.reset;
    const reset = resetOwner ? { trialRan: (acts: Parameters<AutomationStudioSiteResetTrialReset["trialRan"]>[0], runId?: string) => observeAutomationStudioTrialPolicy(request, "reset", { receiver: resetOwner, callback: resetOwner.trialRan, args: [acts, runId] }, acts) } : undefined;
    return await automationStudioSubflowFromStepRun({ from, latest: request.proposal, scope: request.scope,
      fromStep: input => observePartialTrialCallback(request, { receiver: undefined, callback: fromStep, args: [input] }, request.signal, input),
      signal: request.signal, reset, offline: automationStudioCandidateTrialOffline(port), repair: this.repair });
  }

  private async predecessors(request: AutomationStudioSubflowTrialRequest, port: AutomationStudioSubflowTrialPreparingPort) {
    return port.admissionPredecessors ? await observeAutomationStudioTrialPolicy(request, "prepare", { receiver: port, callback: port.admissionPredecessors, args: [request.scope] }, request.scope) : [];
  }

  /** The builder's completion rule, asked once the receipt names the latest proposal. Never the whole candidate's. */
  completion(receipt: { revision: number; digest: string }): AutomationStudioLlmEvidenceCompletionCheck {
    if (!this.input.port) return { ok: true };
    const answer = this.verdicts.get(key(receipt));
    const closed = this.closedDigests.get(receipt.digest);
    if (closed) return refusal("subflow.trial_unchanged_after_no", "This exact proposal was judged no and has not changed. Change it, submit it, test the new revision, and complete only after a yes.", { previousFeedback: closed });
    const repeated = this.repeatedFailures.get(key(receipt));
    if (answer && repeated) return refusal(`subflow.trial_${answer.verdict}`, repeatedInstruction(repeated), { verdict: answer.verdict, entryPrepared: answer.entryPrepared, failedStep: repeated, trialFeedback: answer.feedback });
    // As the test refuses a whole test while a failed test's repair is unchecked, so does completion (header, t804).
    const latest = this.input.latest();
    const pending = latest && this.repair.standing ? { step: this.repair.step(latest) } : undefined;
    if (latest && pending) return refusal(FROM_STEP_FIRST, this.input.port.fromStep && this.repair.refuses(latest, undefined) ? REPAIR_WORDS.refused(pending.step, latest) : "A failed test's repair is still unchecked. Test the whole part when you believe the repair works; an earlier yes cannot complete this brief.", pending.step ? { repairStep: pending.step.key } : {});
    if (answer?.verdict === "yes" && answer.entryPrepared) return { ok: true };
    if (!answer) return refusal("subflow.trial_required", `Test this proposal first: call ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} with revision ${receipt.revision} and digest ${receipt.digest}, and complete only after it answers yes for that revision and digest.`);
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
  private async checkRows(port: AutomationStudioSubflowTrialPreparingPort, yes: AutomationStudioSubflowTrialResult, reads: AutomationStudioSubflowTrialKeptEveryRowRead[], signal: AbortSignal, invocation: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> {
    let raw: unknown;
    try {
      const request = { scope: structuredClone(invocation.scope), revision: yes.revision, digest: yes.digest, ...(yes.trialRunId ? { trialRunId: yes.trialRunId } : {}), reads: structuredClone(reads), signal };
      raw = port.checkRows ? await observePartialTrialCallback(invocation, { receiver: port, callback: port.checkRows, args: [request] }, signal) : undefined;
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
  private async ask(port: AutomationStudioSubflowTrialPort, latest: AutomationStudioSubflowProposal, signal: AbortSignal, startedWith: readonly string[], earlierAdvice: AutomationStudioSubflowTrialRequest["earlierAdvice"], change: AutomationStudioTrialChangeSession | undefined, invocation: AutomationStudioSubflowTrialRequest): Promise<ReturnType<typeof automationStudioSubflowTrialResultRead>> {
    const identity = this.identity(invocation.scope);
    let raw: unknown, finished: AutomationStudioTrialChangeOutcome | undefined; // What its readings finished with (header, t787).
    try {
      const request: AutomationStudioSubflowTrialRequest = { ...this.request(latest, signal, startedWith, earlierAdvice, invocation.scope), ...(change ? { siteChange: async (acts, actsSignal) => (finished = await finishAutomationStudioSiteResetSession(request, change, acts, actsSignal)) } : {}) };
      raw = await invokePartialTrialPort(invocation, port, request);
    } catch (error) {
      if (signal.aborted || isPartialTrialReadOnly(invocation)) throw error;
      // The port's own error text may carry page or account detail, so the model is told only its kind (header, lane 3).
      return { answer: { partial: true, scope: "subflow", identity, revision: latest.revision, digest: latest.digest, verdict: "execution_failed", feedback: Stop.portFailed("subflow.trial_port_failed", error), entryPrepared: false } };
    }
    // The gate's own checks of what the port answered (`./subflow-trial-result.ts`); a yes its own change contradicts is a no (header, t787).
    const read = automationStudioSubflowTrialResultRead(raw, identity, latest);
    return { ...read, answer: automationStudioTrialChangeContradictedNo(read.answer, finished) };
  }

  /** The request a trial of `latest` sends: the port's, and the offline-first check's before any reset (header, P6). */
  private request(latest: AutomationStudioSubflowProposal, signal: AbortSignal, startedWith: readonly string[], earlierAdvice: AutomationStudioSubflowTrialRequest["earlierAdvice"] = [], scope = this.input.scope): AutomationStudioSubflowTrialRequest {
    const request = { scope: structuredClone(scope), proposal: deepFreeze(structuredClone(latest)), signal, ...(startedWith.length ? { startedWith: [...startedWith] } : {}), ...(earlierAdvice?.length ? { earlierAdvice } : {}) };
    inheritPartialTrialContext(this, request);
    return request;
  }

  /** What earlier judged trials advised, for the judge of a trial of `latest` (header, t752). */
  private adviceFor(latest: AutomationStudioSubflowProposal): AutomationStudioSubflowTrialRequest["earlierAdvice"] {
    return this.earlierAdvice.advice(latest.revision, latest.subflows ? { subflows: latest.subflows } : undefined);
  }

  private identity(scope = this.input.scope): AutomationStudioSubflowScopeIdentity {
    const { buildId, briefId, planDigest, subflowKey } = scope;
    return { buildId, briefId, planDigest, subflowKey };
  }
}

/** This gate's own kept conditions, then each carried one it does not keep as written already (header, t689). */
function withCarried(own: AutomationStudioResultKeptCondition[], carried: readonly AutomationStudioResultKeptCondition[]): AutomationStudioResultKeptCondition[] {
  const written = new Set(own.map((condition) => condition.written));
  return [...own, ...carried.filter((condition) => !written.has(condition.written)).map((condition) => structuredClone(condition))];
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
import { automationStudioSiteResetTrialSteps } from "../reset-admission/index.ts";
import type { AutomationStudioFlowBootstrapNode } from "../plan/index.ts";
