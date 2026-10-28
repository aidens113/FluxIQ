import { automationStudioActivityEndedReason, automationStudioActivityTimeLimitTold, emitAutomationStudioActivity, observeAutomationStudioEvidenceLoop, type AutomationStudioActivityTimeLimitTried } from "../../activity/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE,
  AutomationStudioFlowBootstrapGenerationError,
  DIAGNOSTIC_SUPERVISOR_ENDING_CODES,
  MAX_DIAGNOSTIC_ENDED_BECAUSE,
  flowBootstrapEvidenceLoopFailure,
  flowBootstrapEvidenceUnusableDecisionFailure,
  flowBootstrapPhaseFailure
} from "../../flow-bootstrap/index.ts";
import type { AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS } from "../../loop-limits/index.ts";
import {
  AUTOMATION_STUDIO_PROJECT_SUPERVISOR_REAL_CLOCK,
  automationStudioProjectActiveInstructionSources,
  automationStudioProjectDigest,
  automationStudioProjectHostLeaseScope,
  createAutomationStudioProjectDispatcher,
  runAutomationStudioProjectSupervisorLoop,
  type AutomationStudioProjectBuildEnding,
  type AutomationStudioProjectBuildRef,
  type AutomationStudioProjectSupervisorKept
} from "../../project-agents/index.ts";
import { automationStudioCandidateStallCode } from "../candidate-failure/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "../candidate-drafts/index.ts";
import { automationStudioFlowBootstrapUnusableDecisions, type generateAutomationStudioFlowCandidateDraft } from "../flow-bootstrap-commands/index.ts";
import { AutomationStudioProjectBuildActsRecord } from "./acts-record.ts";
import { automationStudioProjectBuildBriefCalls } from "./brief-calls.ts";
import { automationStudioProjectBuildBriefPorts } from "./brief-ports.ts";
import { AutomationStudioProjectBuildDecisions } from "./decisions.ts";
import { automationStudioProjectBuildDraftRecord } from "./draft-record.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_CODES, automationStudioProjectBuildEndingTold, automationStudioProjectBuildRecordTold } from "../project-build-ending/index.ts";
import type { AutomationStudioProjectBuildKeptProposals } from "./entry-preparation.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_LOCAL_HOST } from "./local-host.ts";
import { AutomationStudioProjectBuildPhaseStart } from "./phase-start.ts";
import { AutomationStudioProjectBuildProposals } from "./proposals.ts";
import { automationStudioProjectBuildRecords } from "./records.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS, AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE } from "./reserve.ts";
import { automationStudioProjectBuildSubflowTrials } from "./subflow-trials.ts";
import { automationStudioProjectBuildSupervisorProvider } from "./supervisor-provider.ts";
import { AutomationStudioProjectBuildTaskChecklist } from "./task-checklist.ts";
import type { AutomationStudioProjectBuildPorts } from "./types.ts";

// A project build (automation-project-agents-plan, unit A5c): the project
// supervisor (`project-agents/supervisor/`) plans the Flow's subflows, the
// dispatcher (`project-agents/dispatch/`) runs a bounded builder per brief, and
// the supervisor assembles their proposals into one whole candidate and tests
// that exact revision. It takes the candidate build's own input and answers
// as the candidate build does -- the saved draft and the whole trial it stands
// on -- so the service promotes it through the same path, unchanged.
//
// Shared once per build: the activity, cancellation root, project database
// hold and generation lock (all around the call), the binding, instruction
// authority, provider, loop limits and creation purse (in `draft`), the project
// ledger, the whole candidate's trial port and judge (`draft.trial`), Core's own
// look the judged whole run's readings take (`./phase-start.ts`, `look`; t775
// D5), the build record and one host scheduler per host port. Per brief: everything in
// `./brief-ports.ts`. Builders are never started through the service's
// generation entry: its generation lock is not re-entrant.
//
// How it ends. A completion on a yes for the latest assembled revision is
// saved as the draft with that trial, for the caller to promote. A supervisor
// that ended honestly, or stopped, with an assembled candidate keeps it as a
// draft too, with no yes to promote on. With none, the build fails as the
// candidate build does: the loop's own failure, or Core's account of the
// ending. A cancel is a cancel. Only a written Flow from nothing: a repair's
// re-author is refused until A7.
//
// **The person is told the ending the supervisor recorded (t590).** The
// chat's message for a failed build was made from the thrown error alone, so
// Core's note of what this build still has on the target (t586,
// `project-agents/supervisor/left-on-target.ts`) reached the build record and
// never the person. The failure keeps its own code and diagnostic, which every
// debug and the Lab read; the recorded ending only adds to what the person is
// told, in Core's words alone (`flow-bootstrap/generation-failure/build-ending.ts`):
// a failure with an ending of its own (a budget, unreadable replies, a silent
// provider) has Core's note after its message; any other is preceded by a chat
// row saying the recorded ending's kind, why, and that note. The note is
// Core's, as the supervisor names it (`ports.leftAtEnding`). Why is the
// supervisor's recorded reason, screened as any reason the model gives is
// (`activity/wording/reason-text.ts`, t649): the row said only "it could not
// finish the Flow", and the person never read why the build ended (A8 frozen
// pair 3, `run-mv9zn5ob-d929084d`, screenshot 00048). A time limit's row says
// the limit, which is its why. A question put to the person (a permission, an
// intervention) is said as it is.
//
// **Why is said once (t741 B5).** Since t649 the failure carries why
// (`endedBecause`) and the chat's ending says it after the ending's kind; the
// row before it said it too, so job-board `run-mvgo9wzn-fad4e050` read the
// supervisor's sentence twice. Where the failure carries why, the row says
// Core's record of its tests and what is left without it.
//
// **What an amendment kept runs in a dependent's entry (t590).** The
// supervisor tells the build, each time a plan comes into force, which earlier
// plans' done proposals it keeps (`ports.kept`); the build's proposals answer
// `keptUnder` from it, so a dependent builder's entry runs a kept predecessor
// although its plan digest is the earlier plan's (`./entry-preparation.ts`).
//
// The supervisor keeps back the judged whole run and one repair round
// (`./reserve.ts`), which no brief's allowance can be carved from. Every
// lasting act the project ledger records is written into the build record as
// it is recorded (`./acts-record.ts`); the build waits for those writes before
// it saves its draft, so a record that could not be written fails the build as
// a dispatcher's record write does.
//
// **A build has a time limit (t592).** The supervisor's run is held to Core's
// `AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS` from its start
// (`project-agents/supervisor/supervisor-loop.ts`). A build that reaches it
// with no assembled candidate fails as an ending the supervisor recorded, never
// as the loop's own cancel, which is what its stopped loop reads as:
// `flow_bootstrap.post_provider_validation_failed` with the issue codes
// `project.build_time_limit` and `project.build_<outcome>`, and the person is
// told the recorded ending as for any other.
//
// **The time limit is said as the time limit (t601).** Everything-store
// `run-mv8id5vg` was stopped by it, and its chat row read "The supervisor ended
// the build: it could not finish the Flow", although the limit ended it and a
// version of its part had been tested twelve times. A build its time limit
// stopped says so in Core's words, with what was tested -- how many of the
// latest plan's subflows passed their own trial, and for each one left how
// often it was tried and what its last trial answered -- and that no whole
// Flow was assembled to test, before Core's note of what is left on the target.
// The trials are counted as the subflow trial port reports them to the build's
// proposals.
//
// **A draft the time limit kept says the time limit too (t608).**
// Everything-store `run-mv8p0p7c` reached its time limit holding an assembled
// candidate, so it was saved as a draft and the person read only its standing
// trial: "Its test run from the start was judged not to do what you asked".
// Nothing said the build ran out of time. Now a build its time limit stopped
// with a draft kept shows the same chat row as one with none: the limit, what
// was tested of the latest plan's subflows, that a whole Flow was assembled and
// what its last whole test said, and Core's note of what is left on the target.
// The draft's trial keeps its own code, which every debug and the Lab read
// (t590); `project.build_time_limit` goes beside it, as the trial's
// `feedback.endingCodes`, which the promotion adds after the draft's own code
// (`../candidate-trial/promotion.ts`), so the draft result carries both and
// the chat's reply opens with the time limit
// (`conversations/commands/create-here.ts`). Which plan the kept draft was
// assembled under is not said: the candidate does not record it.
//
// **A silent provider is said as that (t619).** A8 canary
// `run-mv8zw5l2-98064abf`: DeepSeek answered none of the supervisor's three
// decisions, its loop ended `llm_evidence_loop.provider_unavailable`, and the
// person read "The supervisor ended the build: it could not finish the Flow"
// and "what the model wrote could not be used", under
// `flow_bootstrap.post_provider_validation_failed`. The loop's ending is
// published as the candidate build publishes it, through the one
// classification both modes share (`flowBootstrapEvidenceLoopFailure`):
// `flow_bootstrap.provider_unavailable`, with Core's message that the
// provider did not answer and nothing was built. Its builders, not its loop,
// act on the target, so the message leaves the page to this build, which puts
// Core's note of what is left after it -- or that nothing this build did is
// still on the target -- and shows no supervisor ending row. The note goes
// before the ending's closing advice to try again later, not after it (t621),
// so the advice is the last thing the person reads; no reset was sent, since
// it would need the same silent provider (`project-agents/supervisor/
// supervisor-loop.ts`), so the note is what tells the person what to take back.
//
// **The person reads all of it in plain words (t567 lane 4).** A job-board
// build's failed chat listed every press the build made in the ledger's terms
// ("click \"No thanks\" link (declared no lasting act, but had an effect:
// possibly lasting)", one press four times), and its ending read "the single
// subflow ... was briefed twice and both builders failed with flow bootstrap.…
// (bootstrap.source port cardinality)". What is left is said as the
// supervisor's ledger tells it in a person's words (`left.told`,
// `activity/wording/left-told.ts`); the ledger's own note stays in the
// record. The supervisor's reason is said only in what of it is plain
// (`activity/wording/ended-reason.ts`), and Core's own words for the ending name no
// supervisor. The failure's codes and diagnostic are unchanged.
//
// **A draft says what was tested of its Flow (G2).** Social
// `run-mvfq957o-40103539` went back to a Flow it had tested whole several
// times, as a new revision; the time limit cut that revision's test off, and
// the ending said the draft was "never tested from its start". A kept draft
// whose latest revision has no verdict of its own stands on the latest
// finished test of the same Flow (`sameFlowTrial`, never a yes), so the chat
// says what that test answered (`conversations/commands/build.ts`); its
// promotion stays a draft, keeping that test's own code
// (`../candidate-trial/promotion.ts`). A test the limit cut is said as cut, in
// the limit's row (`activity/wording/time-limit-told.ts`, where the limit's
// words now live) and as `project.build_trial_cut` beside the time limit's
// code, which the chat's draft words read.
//
// **The ending says what Core's record holds of its tests (t738).**
// Everything-store `run-mvgf04kw-310fc169` ended on the supervisor's reason
// "the part that reaches checkout never passed its own test", although that
// part's own trial was judged yes and the judged whole run did every act; the
// draft it kept said nothing of why the build ended at all. The ending's row
// now says, beside the supervisor's screened reason, what Core recorded: how
// many parts passed their own trials, under whichever plan, and what the
// judged whole run did and was judged
// (`../project-build-ending/record-told.ts`); and where it says that, the
// reason's own claims of how a part's test went are left out
// (`../project-build-ending/reason-checked.ts`), so the person never reads a
// part-level claim the record contradicts. A draft the supervisor ended on,
// rather than completed, shows that row too, as a build with none does.
//
// **The ending row is the one account of the ending (t753).** Round 5 said one
// verdict three times -- the row, the command's answer ("It was never test-run
// from the start, so nothing was put into the Flow"), the draft's card line --
// though both of its tests had been whole runs; and t741 B5's split, the why in
// the chat's answer and the rest in the row, read "The build failed: FluxIQ
// could not finish the Flow: I could not finish this. Saving ... left changes
// on the site" under a row saying the build left no change. The row now says
// all of it, once (`../project-build-ending/ending-told.ts`): the supervisor's
// reason, without an opening that restates the ending, then Core's record of
// its tests, then what is left. What it hands back says so
// (`project.build_ending_told`: a failure's issue code, a kept draft's ending
// code, `../project-build-ending/codes.ts`), so the chat's commands add only
// what the Flow keeps and what the person can do next. The failure still
// carries why (`endedBecause`), for the build's last status line.
//
// Core's record counts every whole run of the Flow, of whichever version
// (`draft.trialRecords`): a Flow assembled again after its whole runs is said
// to have been test-run whole, and its latest version not, never "never
// tested". A supervisor that ended unfinished while its latest whole test was
// judged yes hands that test back with `project.build_ended_unfinished`, which
// the promotion keeps as a draft (`../candidate-trial/promotion.ts`), rather
// than handing back none, which the chat read as never tested.

type DraftInput = Parameters<typeof generateAutomationStudioFlowCandidateDraft>[0];
type DraftResult = { record: AutomationStudioFlowCandidateDraftRecord; trial: AutomationStudioCandidateTrialResult | undefined };

export async function runAutomationStudioProjectBuild(project: AutomationStudioProjectBuildPorts, draft: DraftInput): Promise<DraftResult> {
  if (project.repair) throw new Error("Project authoring cannot repair a run yet.");
  if (!draft.trial || !draft.candidateId) throw new Error("A project build needs the whole candidate's trial runner.");
  const purse = draft.loop.purse;
  if (!purse) throw new Error("A project build runs under the Flow's creation purse.");
  const { projectId, flowId } = draft.submission;
  const candidateId = draft.candidateId;
  const ref: AutomationStudioProjectBuildRef = { projectId, flowId, buildId: project.buildId };
  const records = automationStudioProjectBuildRecords(project);
  const host = project.host ?? AUTOMATION_STUDIO_PROJECT_BUILD_LOCAL_HOST;
  // What the plan in force kept of earlier plans' proposals, as the supervisor tells it (header).
  let kept: AutomationStudioProjectSupervisorKept | undefined;
  // What the supervisor's ending left on the target, in Core's words, as it named it (header).
  let left: { note: string | undefined; told?: string } | undefined;
  const proposals: AutomationStudioProjectBuildProposals & AutomationStudioProjectBuildKeptProposals = Object.assign(new AutomationStudioProjectBuildProposals(), {
    keptUnder: (subflowKey: string, madeUnder: string, planDigest: string) => kept?.planDigest === planDigest && kept.madeUnder.get(subflowKey) === madeUnder
  });
  // Each subflow's trials, by its key, as the subflow trial port reports them: what a time limit's words say was tested (header, t601).
  const trials = new Map<string, AutomationStudioActivityTimeLimitTried>();
  const trialled = proposals.trialled.bind(proposals);
  proposals.trialled = (scope, proposal, verdict) => {
    trialled(scope, proposal, verdict);
    const seen = trials.get(scope.subflowKey);
    trials.set(scope.subflowKey, { count: (seen?.count ?? 0) + 1, last: verdict, passed: seen?.passed === true || verdict === "yes" });
  };
  const { binding } = project;
  let running = true;
  const judge = { provider: draft.harness.provider, timeoutMs: draft.harness.timeoutMs, signal: draft.loop.signal };
  const subflowTrials = automationStudioProjectBuildSubflowTrials({ ref, environment: project.trialEnvironment, binding, judge, records, proposals, leases: automationStudioProjectHostLeaseScope(host).scheduler, running: () => running, phase: project.repair ? "repair" : "test" });
  const decisions = new AutomationStudioProjectBuildDecisions(draft, () => [draft.trialSpend?.(), subflowTrials.spent()]);
  const acts = AutomationStudioProjectBuildActsRecord.of(project.ledger);
  acts.bind(records, ref);
  // The whole trials' judge reads the task checklist from this build's record (unit A9, `./task-checklist.ts`).
  AutomationStudioProjectBuildTaskChecklist.bind(project.trialEnvironment, { records, ref });
  const accounting = () => decisions.accounting();
  const dispatch = createAutomationStudioProjectDispatcher({
    record: { store: records, ref }, purse, cancellation: project.cancellation, host, ledger: project.ledger,
    ports: automationStudioProjectBuildBriefPorts({ project, draft, decisions, subflowTrial: subflowTrials.port, proposals, accounting, acts }),
    maxCalls: automationStudioProjectBuildBriefCalls,
    // A single-subflow brief's trials, which never reach the scoped trial port, are the proposals' too (t679).
    trialled: (scope, proposal, verdict) => proposals.trialled(scope, proposal, verdict)
  });
  const sources = automationStudioProjectActiveInstructionSources(project.instructions);
  const { purse: _purse, signal: _signal, budget: _budget, ...loop } = draft.loop;
  const maxIterations = loop.maxIterations;
  // The supervisor's decisions carry its own system instructions, never the domain's operating text (`./supervisor-provider.ts`, t569).
  const supervisorProvider = automationStudioProjectBuildSupervisorProvider(draft.harness.provider, binding.domainId);
  const runSupervisorHarness: typeof draft.runHarness = async (request) => await draft.runHarness({ ...request, provider: supervisorProvider });
  const decide = (completionSchema: Parameters<AutomationStudioProjectBuildDecisions["decide"]>[0]["completionSchema"]) => decisions.decide({ runHarness: runSupervisorHarness, wrapDecision: draft.wrapDecision, completionSchema });
  const unusableDecisions = automationStudioFlowBootstrapUnusableDecisions({
    maxConsecutiveUnusableDecisions: draft.maxConsecutiveUnusableDecisions, maxIterations, callerEnding: (progress) => draft.ending(progress, accounting()),
    stalled: (progress) => flowBootstrapEvidenceUnusableDecisionFailure(progress, accounting(), automationStudioCandidateStallCode(progress.issueCodes))
  });
  // The judged whole run's witnesses are read through Core's own look, where its arrival exists (header, t775 D5).
  const look = AutomationStudioProjectBuildPhaseStart.look({ binding, environment: project.trialEnvironment, ledger: project.ledger, cancellation: project.cancellation });
  let outcome: Awaited<ReturnType<typeof runAutomationStudioProjectSupervisorLoop>>;
  try {
    outcome = await runAutomationStudioProjectSupervisorLoop({
      ports: {
        build: ref, record: records, instructionDigest: automationStudioProjectDigest("project.instructions.v1", sources), sources, dispatch,
        proposals: (proposal) => proposals.byRef(proposal), projectLedger: project.ledger, ...(look ? { look } : {}), submission: draft.submission,
        trial: { candidateId, port: draft.trial }, purse,
        reserve: { calls: AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE.calls, unpriced: { ...AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE.unpriced } },
        finishing: { ...AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS },
        kept: (told) => {
          kept = told;
        },
        leftAtEnding: (told) => {
          left = told;
        },
        ...(draft.loop.signal ? { signal: draft.loop.signal } : {})
      },
      loop: { ...loop, unusableDecisions, decide: decide(undefined) },
      observe: (observed) => observeAutomationStudioEvidenceLoop({ ...observed, decide: decide(observed.completionSchema) }),
      // The time limit's timers, on the real clock; passed here so a test of this build can hold them (t616, `project-agents/supervisor/supervisor-loop.ts`).
      clock: AUTOMATION_STUDIO_PROJECT_SUPERVISOR_REAL_CLOCK
    });
  } catch (error) {
    // A stall a guard ended the loop on is thrown on once its ending is recorded (t586): the person reads that ending (header).
    if (!(error instanceof AutomationStudioFlowBootstrapGenerationError) || draft.loop.signal?.aborted) throw error;
    throw toldEnding(error, (await records.read(ref))?.record.ending, left, undefined, automationStudioProjectBuildRecordTold({ parts: trials, assembled: false, wholeRuns: wholeRuns(draft) }));
  } finally {
    running = false;
  }
  const spent = accounting();
  draft.progress(spent, "post_provider_validation");
  if (outcome.ending?.outcome === "cancelled" || draft.loop.signal?.aborted) throw new DOMException("Build stopped. The Flow was not promoted.", "AbortError");
  // The whole trials' acts, recorded under the supervisor, are written last of all (`./acts-record.ts`).
  acts.sync();
  await acts.flushed();
  const candidate = outcome.candidate;
  if (!candidate) {
    // A build its time limit stopped ends as recorded, not as its stopped loop's cancel (header).
    const failure = outcome.loop && !outcome.loop.ok && !outcome.timedOut
      ? draft.ending(outcome.loop, spent) ?? flowBootstrapEvidenceLoopFailure(outcome.loop, spent, undefined, "said_by_caller")
      : new AutomationStudioFlowBootstrapGenerationError({ ...flowBootstrapPhaseFailure("post_provider_validation", spent, "flow_bootstrap.post_provider_validation_failed").diagnostic, issueCodes: [...(outcome.timedOut ? [TIME_LIMIT_CODE] : []), `project.build_${outcome.ending?.outcome ?? "blocked"}`] });
    const timedOut = outcome.timedOut ? timeLimitWords(partSubflows((await records.read(ref))?.record.plans.at(-1)?.plan.partOf), trials) : undefined;
    // What Core recorded of its tests is said beside the supervisor's reason (header, t738).
    throw toldEnding(failure, outcome.ending, left, timedOut, automationStudioProjectBuildRecordTold({ parts: trials, assembled: false, wholeRuns: wholeRuns(draft) }));
  }
  const current = await draft.currentBinding();
  if (current.executionDigest !== candidate.baseDependencyDigest || current.settingsRevision !== draft.baseSettingsRevision) throw new Error("FLOW_BOOTSTRAP_STALE: Flow or settings changed during candidate generation.");
  draft.progress(spent, "persistence");
  const record = await draft.store.save(automationStudioProjectBuildDraftRecord({
    candidateId, projectId, flowId, candidate, accounting: spent, sourceInstructionIds: draft.sourceInstructionIds, instructionText: draft.submission.instructionText ?? "",
    baseSettingsRevision: draft.baseSettingsRevision, ...(draft.originalSource ? { originalSource: draft.originalSource } : {})
  }), draft.loop.signal);
  // Only a completion stands on its yes: a supervisor that ended without completing keeps its yes as the draft's, which never promotes (header, t753).
  const unfinished = outcome.status === "ended" && outcome.trial?.verdict === "yes";
  // A draft whose latest revision was never finished testing stands on the same Flow's latest finished test (header, G2).
  const trial = outcome.trial ?? (outcome.status === "ended" ? outcome.sameFlowTrial : undefined);
  // The codes the draft's trial carries beside its own: why its yes does not stand, and that the ending row told it (header, t608, t753).
  const withCodes = (codes: readonly string[]) => (trial ? { ...trial, feedback: { ...trial.feedback, endingCodes: [...(unfinished ? [ENDED_UNFINISHED_CODE] : []), ...codes] } } : undefined);
  // A draft its time limit kept says the time limit, not only its last whole test (header, t608).
  if (outcome.timedOut && outcome.status === "ended" && !unfinished) {
    const subflows = partSubflows((await records.read(ref))?.record.plans.at(-1)?.plan.partOf);
    const words = timeLimitWords(subflows, trials, { tested: trial?.verdict, ...(outcome.trialCut ? { cut: true } : {}) });
    const title = words.title, text = `${words.tested} ${left?.told ?? NOTHING_LEFT}`;
    emitAutomationStudioActivity({ phase: "building", label: title, detail: { kind: "note", title, text, status: "failed" } });
    // The trial's own code stays its code; the time limit, and a test it cut, go beside it (header, t608, G2).
    return { record, trial: withCodes([TIME_LIMIT_CODE, ...(outcome.trialCut ? [TRIAL_CUT_CODE] : []), TOLD_CODE]) };
  }
  // A draft the supervisor ended on says why, against Core's record of its tests, and that record: the one account (header, t738, t753).
  const ended = outcome.status === "ended" ? outcome.ending : undefined;
  if (ended && (ended.outcome === "partial" || ended.outcome === "blocked")) {
    const title = ENDED_WORDS[ended.outcome];
    const { text } = automationStudioProjectBuildEndingTold({ reason: ended.reason, left, record: automationStudioProjectBuildRecordTold({ parts: trials, assembled: true, whole: trial, wholeRuns: wholeRuns(draft) }) });
    emitAutomationStudioActivity({ phase: "building", label: title, detail: { kind: "note", title, text, status: "failed" } });
    return { record, trial: withCodes([TOLD_CODE]) };
  }
  return { record, trial: unfinished ? withCodes([]) : trial };
}

/**
 * Every whole run of the Flow from its start this build made, of whichever version (header, t753): the build's trial
 * records, each run once by its run id (a judge asked again names the same run), a trial whose start failed before
 * any run opened not counted.
 */
function wholeRuns(draft: DraftInput): { count: number; last: AutomationStudioCandidateTrialResult["verdict"] } | undefined {
  const runs = new Map<string, AutomationStudioCandidateTrialResult["verdict"]>();
  for (const trial of draft.trialRecords?.() ?? []) if (trial.trialRunId) runs.set(trial.trialRunId, trial.verdict);
  const last = [...runs.values()].at(-1);
  return last === undefined ? undefined : { count: runs.size, last };
}

/**
 * The latest plan's subflows that carry parts, which a time limit's words count as its parts (t601): never the
 * router-run subflow Core adds to a plan of several, which carries none and is never tried on its own (t679).
 */
function partSubflows(partOf: Readonly<Record<string, readonly string[]>> | undefined): string[] {
  return Object.entries(partOf ?? {}).filter(([, parts]) => parts.length > 0).map(([key]) => key);
}

/** The code a build its time limit stopped carries: on its failure's issue codes, and as a kept draft's trial code (header, t608). */
const TIME_LIMIT_CODE = "project.build_time_limit";
/** Beside it, when the limit cut a test of the kept draft's Flow after its latest finished one (header, G2). */
const TRIAL_CUT_CODE = "project.build_trial_cut";
/** That the ending row told the ending, and that the build ended without completing on a yes (header, t753). */
const TOLD_CODE = AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_CODES.told;
const ENDED_UNFINISHED_CODE = AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_CODES.endedUnfinished;

/** The questions a stall puts to the person: said as they are (`project-agents/supervisor/supervisor-loop.ts`). */
const PERSON_CODES: ReadonlySet<string> = new Set(["flow_bootstrap.permission_required", "flow_bootstrap.user_intervention_required"]);
const MAX_MESSAGE = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE;
/** The supervisor's recorded ending, by its kind, in Core's words (header); its reason is said after, screened. */
const ENDED_WORDS = Object.freeze({
  partial: "FluxIQ stopped with the Flow only partly built.",
  blocked: "FluxIQ could not finish the Flow."
});
const NOTHING_LEFT = "The build left no change on the site that it knows of.";

/**
 * What a build its time limit stopped says (header, t601, G2), in Core's words
 * alone (`activity/wording/time-limit-told.ts`): the limit, what was tested of
 * the latest plan's subflows, and what became of the whole Flow.
 */
function timeLimitWords(subflows: readonly string[], trials: ReadonlyMap<string, AutomationStudioActivityTimeLimitTried>, assembled?: Parameters<typeof automationStudioActivityTimeLimitTold>[0]["assembled"]): { title: string; tested: string } {
  return automationStudioActivityTimeLimitTold({ limitMs: AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS, subflows, trials, ...(assembled ? { assembled } : {}) });
}

/**
 * What the person is told of the supervisor's recorded ending beside
 * `failure` (header): its code and diagnostic stay; a failure with an ending of
 * its own has Core's note of what is left after its message, and any other is
 * shown the ending's kind and that note as a chat row before it is thrown.
 */
function toldEnding(failure: Error, recorded: AutomationStudioProjectBuildEnding | undefined, left: { note: string | undefined; told?: string } | undefined, timedOut?: { title: string; tested: string }, record?: string): Error {
  if (!recorded || (recorded.outcome !== "partial" && recorded.outcome !== "blocked") || !(failure instanceof AutomationStudioFlowBootstrapGenerationError)) return failure;
  const { diagnostic } = failure;
  if (PERSON_CODES.has(diagnostic.code)) return failure;
  // A silent provider's ending leaves the target to this build, which says what is left of it, or that nothing is (header, t619).
  // What is left, in a person's words; the ledger's note stays in the record (header, t567 lane 4).
  const note = left?.note !== undefined ? left.told ?? left.note : diagnostic.ending?.kind === "provider_unavailable" ? left?.told ?? NOTHING_LEFT : undefined;
  if (diagnostic.ending) {
    if (!note) return failure;
    // A silent provider's ending closes on its advice to try again later; what is left is said before it (t621).
    const message = diagnostic.ending.kind === "provider_unavailable" ? beforeAdvice(diagnostic.ending.message, note) : fitted(diagnostic.ending.message, note);
    return new AutomationStudioFlowBootstrapGenerationError({ ...diagnostic, ending: { ...diagnostic.ending, message } });
  }
  // The time limit is said as the time limit, with what was tested and is left (header, t601).
  const title = timedOut?.title ?? ENDED_WORDS[recorded.outcome];
  // The one account (header, t753): why the supervisor ended it, then Core's record of its tests, then what is left.
  const said = timedOut ? undefined : automationStudioProjectBuildEndingTold({ reason: recorded.reason, left, record });
  const why = said?.why;
  // The failure carries why too, beside the supervisor's ending it explains, for the build's last status line (header, t649).
  const ended = why === undefined ? undefined : why.length <= MAX_DIAGNOSTIC_ENDED_BECAUSE ? why.trim() : automationStudioActivityEndedReason(why, MAX_DIAGNOSTIC_ENDED_BECAUSE);
  const carried = Boolean(ended) && diagnostic.issueCodes?.some((code) => DIAGNOSTIC_SUPERVISOR_ENDING_CODES.has(code)) === true;
  const text = said?.text ?? `${timedOut?.tested ?? ""} ${note ?? NOTHING_LEFT}`.trim();
  emitAutomationStudioActivity({ phase: "building", label: title, detail: { kind: "note", title, text, status: "failed" } });
  // This row told the ending: the chat's commands say only what the Flow keeps and what to do next (header, t753).
  const codes = diagnostic.issueCodes ?? [];
  const issueCodes = codes.includes(TOLD_CODE) ? [...codes] : [...codes.slice(0, MAX_ISSUE_CODES - 1), TOLD_CODE];
  return new AutomationStudioFlowBootstrapGenerationError({ ...diagnostic, issueCodes, ...(carried && ended ? { endedBecause: ended } : {}) });
}

/** The most issue codes a failure carries (`flow-bootstrap/generation-failure/diagnostic.ts`). */
const MAX_ISSUE_CODES = 16;

/**
 * A message whose last sentence is its advice, with `note` put before that
 * sentence (t621): the advice is kept whole after the note where it fits, and
 * the message's opening gives way first, as `fitted` cuts it.
 */
function beforeAdvice(said: string, note: string): string {
  const end = said.lastIndexOf(". ");
  if (end < 0) return fitted(said, note);
  const advice = said.slice(end + 2);
  const room = MAX_MESSAGE - advice.length - 1;
  // A note too long to leave the advice room keeps all of its room, as `fitted` gives it.
  return note.length < room ? `${fitted(said.slice(0, end + 1), note, room)} ${advice}` : fitted(said.slice(0, end + 1), note);
}

/** `said` and then `note` within `max`, the length an ending's message may hold by default: the note in full, `said` cut at a sentence's end where it must give way. */
function fitted(said: string, note: string, max = MAX_MESSAGE): string {
  const whole = note.length <= max ? note : `${note.slice(0, max - "; and more.".length).replace(/;[^;]*$/u, "")}; and more.`;
  const room = max - whole.length - 1;
  if (said.length <= room) return `${said} ${whole}`;
  const cut = said.slice(0, room);
  const end = cut.lastIndexOf(". ");
  return end > 0 ? `${cut.slice(0, end + 1)} ${whole}` : whole;
}
