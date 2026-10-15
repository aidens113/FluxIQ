import { emitAutomationStudioActivity, observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE,
  AutomationStudioFlowBootstrapGenerationError,
  flowBootstrapEvidenceLoopFailure,
  flowBootstrapEvidenceUnusableDecisionFailure,
  flowBootstrapPhaseFailure
} from "../../flow-bootstrap/index.ts";
import type { AutomationStudioCandidateTrialResult, AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
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
import type { AutomationStudioProjectBuildKeptProposals } from "./entry-preparation.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_LOCAL_HOST } from "./local-host.ts";
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
// ledger, the whole candidate's trial port and judge (`draft.trial`), the build
// record and one host scheduler per host port. Per brief: everything in
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
// row saying the recorded ending's kind and that note. The model's reason is
// never said: the note is Core's, as the supervisor names it
// (`ports.leftAtEnding`). A question put to the person (a permission, an
// intervention) is said as it is.
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
// still on the target -- and shows no supervisor ending row.

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
  let left: { note: string | undefined } | undefined;
  const proposals: AutomationStudioProjectBuildProposals & AutomationStudioProjectBuildKeptProposals = Object.assign(new AutomationStudioProjectBuildProposals(), {
    keptUnder: (subflowKey: string, madeUnder: string, planDigest: string) => kept?.planDigest === planDigest && kept.madeUnder.get(subflowKey) === madeUnder
  });
  // Each subflow's trials, by its key, as the subflow trial port reports them: what a time limit's words say was tested (header, t601).
  const trials = new Map<string, Tried>();
  const trialled = proposals.trialled.bind(proposals);
  proposals.trialled = (scope, proposal, verdict) => {
    trialled(scope, proposal, verdict);
    const seen = trials.get(scope.subflowKey);
    trials.set(scope.subflowKey, { count: (seen?.count ?? 0) + 1, last: verdict, passed: seen?.passed === true || verdict === "yes" });
  };
  const { binding } = project;
  let running = true;
  const judge = { provider: draft.harness.provider, timeoutMs: draft.harness.timeoutMs, signal: draft.loop.signal };
  const subflowTrials = automationStudioProjectBuildSubflowTrials({ ref, environment: project.trialEnvironment, binding, judge, records, proposals, leases: automationStudioProjectHostLeaseScope(host).scheduler, running: () => running });
  const decisions = new AutomationStudioProjectBuildDecisions(draft, () => [draft.trialSpend?.(), subflowTrials.spent()]);
  const acts = AutomationStudioProjectBuildActsRecord.of(project.ledger);
  acts.bind(records, ref);
  // The whole trials' judge reads the task checklist from this build's record (unit A9, `./task-checklist.ts`).
  AutomationStudioProjectBuildTaskChecklist.bind(project.trialEnvironment, { records, ref });
  const accounting = () => decisions.accounting();
  const dispatch = createAutomationStudioProjectDispatcher({
    record: { store: records, ref }, purse, cancellation: project.cancellation, host, ledger: project.ledger,
    ports: automationStudioProjectBuildBriefPorts({ project, draft, decisions, subflowTrial: subflowTrials.port, proposals, accounting, acts }),
    maxCalls: automationStudioProjectBuildBriefCalls
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
  let outcome: Awaited<ReturnType<typeof runAutomationStudioProjectSupervisorLoop>>;
  try {
    outcome = await runAutomationStudioProjectSupervisorLoop({
      ports: {
        build: ref, record: records, instructionDigest: automationStudioProjectDigest("project.instructions.v1", sources), sources, dispatch,
        proposals: (proposal) => proposals.byRef(proposal), projectLedger: project.ledger, submission: draft.submission,
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
    throw toldEnding(error, (await records.read(ref))?.record.ending, left);
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
    const timedOut = outcome.timedOut ? timeLimitWords(Object.keys((await records.read(ref))?.record.plans.at(-1)?.plan.partOf ?? {}), trials) : undefined;
    throw toldEnding(failure, outcome.ending, left, timedOut);
  }
  const current = await draft.currentBinding();
  if (current.executionDigest !== candidate.baseDependencyDigest || current.settingsRevision !== draft.baseSettingsRevision) throw new Error("FLOW_BOOTSTRAP_STALE: Flow or settings changed during candidate generation.");
  draft.progress(spent, "persistence");
  const record = await draft.store.save(automationStudioProjectBuildDraftRecord({
    candidateId, projectId, flowId, candidate, accounting: spent, sourceInstructionIds: draft.sourceInstructionIds, instructionText: draft.submission.instructionText ?? "",
    baseSettingsRevision: draft.baseSettingsRevision, ...(draft.originalSource ? { originalSource: draft.originalSource } : {})
  }), draft.loop.signal);
  // Only a completion stands on its yes: a supervisor that ended without completing promotes nothing, whatever its last trial said.
  const trial = outcome.status === "candidate" || outcome.trial?.verdict !== "yes" ? outcome.trial : undefined;
  // A draft its time limit kept says the time limit, not only its last whole test (header, t608).
  if (outcome.timedOut && outcome.status === "ended" && outcome.trial?.verdict !== "yes") {
    const subflows = Object.keys((await records.read(ref))?.record.plans.at(-1)?.plan.partOf ?? {});
    const words = timeLimitWords(subflows, trials, { tested: trial?.verdict });
    const title = words.title, text = `${words.tested} ${left?.note ?? NOTHING_LEFT}`;
    emitAutomationStudioActivity({ phase: "building", label: title, detail: { kind: "note", title, text, status: "failed" } });
    // The trial's own code stays its code; the time limit goes beside it (header, t608).
    return { record, trial: trial ? { ...trial, feedback: { ...trial.feedback, endingCodes: [TIME_LIMIT_CODE] } } : undefined };
  }
  return { record, trial };
}

/** The code a build its time limit stopped carries: on its failure's issue codes, and as a kept draft's trial code (header, t608). */
const TIME_LIMIT_CODE = "project.build_time_limit";

/** The questions a stall puts to the person: said as they are (`project-agents/supervisor/supervisor-loop.ts`). */
const PERSON_CODES: ReadonlySet<string> = new Set(["flow_bootstrap.permission_required", "flow_bootstrap.user_intervention_required"]);
const MAX_MESSAGE = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE;
/** The supervisor's recorded ending, by its kind, in Core's words (header): never its reason, which holds the model's. */
const ENDED_WORDS = Object.freeze({
  partial: "The supervisor ended the build with only part of the Flow built.",
  blocked: "The supervisor ended the build: it could not finish the Flow."
});
const NOTHING_LEFT = "Nothing this build did is still on the target.";

/** One subflow's trials: how many ran, what the last answered, and whether any answered yes. */
type Tried = { count: number; last: AutomationStudioCandidateTrialVerdict; passed: boolean };

/** A subflow's last trial, in words that finish "whose last test ...". */
const LAST_TRIAL_WORDS: Readonly<Record<AutomationStudioCandidateTrialVerdict, string>> = Object.freeze({
  yes: "passed",
  no: "was judged not to do what was asked",
  unsure: "could not be confirmed",
  not_judged: "could not be confirmed",
  execution_failed: "did not run to its end"
});

/**
 * What a build its time limit stopped says (header, t601): the limit, then
 * what was tested of the latest plan's subflows and what is left, in Core's
 * words alone -- counts and verdicts, never a subflow's name or the model's
 * reason.
 */
function timeLimitWords(subflows: readonly string[], trials: ReadonlyMap<string, Tried>, assembled?: { tested: AutomationStudioCandidateTrialVerdict | undefined }): { title: string; tested: string } {
  const title = `The build reached its time limit of ${spoken(AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS)} before a whole test of the Flow passed.`;
  // What became of the whole Flow: never assembled, or assembled and kept as a draft with its last whole test (t608).
  const whole = !assembled
    ? "The whole Flow was not assembled, so it was never tested as one."
    : assembled.tested === undefined
      ? "A whole Flow was assembled and never tested from its start; it is kept as a draft, and nothing was put into the Flow."
      : `A whole Flow was assembled and tested from its start, and its last whole test ${LAST_TRIAL_WORDS[assembled.tested]}; it is kept as a draft, and nothing was put into the Flow.`;
  if (!subflows.length) return { title, tested: assembled ? whole : "No plan of its parts was written, so nothing was tested." };
  const passed = subflows.filter((key) => trials.get(key)?.passed === true).length;
  const opening = subflows.length === 1
    ? `Its one part ${passed ? "passed" : "did not pass"} its own test.`
    : passed === 0 ? `None of its ${subflows.length} parts passed its own test.` : `Of its ${subflows.length} parts, ${passed} passed ${passed === 1 ? "its" : "their"} own test.`;
  const left = subflows.filter((key) => trials.get(key)?.passed !== true).map((key) => {
    const tried = trials.get(key);
    if (!tried) return "a part never tested";
    return `a part tested ${tried.count === 1 ? "once" : `${tried.count} times`} whose last test ${LAST_TRIAL_WORDS[tried.last]}`;
  });
  const rest = left.length ? ` Left: ${joinedList(left)}.` : "";
  return { title, tested: `${opening}${rest} ${whole}` };
}

function joinedList(items: readonly string[]): string {
  return items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join("; ")}; and ${items[items.length - 1]}`;
}

/** A time limit in words: whole minutes where it is some, else seconds (as the supervisor's recorded ending says it). */
function spoken(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} minutes`;
  const seconds = Math.max(1, Math.round(ms / 1_000));
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}

/**
 * What the person is told of the supervisor's recorded ending beside
 * `failure` (header): its code and diagnostic stay; a failure with an ending of
 * its own has Core's note of what is left after its message, and any other is
 * shown the ending's kind and that note as a chat row before it is thrown.
 */
function toldEnding(failure: Error, recorded: AutomationStudioProjectBuildEnding | undefined, left: { note: string | undefined } | undefined, timedOut?: { title: string; tested: string }): Error {
  if (!recorded || (recorded.outcome !== "partial" && recorded.outcome !== "blocked") || !(failure instanceof AutomationStudioFlowBootstrapGenerationError)) return failure;
  const { diagnostic } = failure;
  if (PERSON_CODES.has(diagnostic.code)) return failure;
  // A silent provider's ending leaves the target to this build, which says what is left of it, or that nothing is (header, t619).
  const note = left?.note ?? (diagnostic.ending?.kind === "provider_unavailable" ? NOTHING_LEFT : undefined);
  if (diagnostic.ending) return note ? new AutomationStudioFlowBootstrapGenerationError({ ...diagnostic, ending: { ...diagnostic.ending, message: fitted(diagnostic.ending.message, note) } }) : failure;
  // The time limit is said as the time limit, with what was tested and is left (header, t601).
  const title = timedOut?.title ?? ENDED_WORDS[recorded.outcome];
  const text = timedOut ? `${timedOut.tested} ${note ?? NOTHING_LEFT}` : note ?? NOTHING_LEFT;
  emitAutomationStudioActivity({ phase: "building", label: title, detail: { kind: "note", title, text, status: "failed" } });
  return failure;
}

/** `said` and then `note` within the length an ending's message may hold: the note in full, `said` cut at a sentence's end where it must give way. */
function fitted(said: string, note: string): string {
  const whole = note.length <= MAX_MESSAGE ? note : `${note.slice(0, MAX_MESSAGE - "; and more.".length).replace(/;[^;]*$/u, "")}; and more.`;
  const room = MAX_MESSAGE - whole.length - 1;
  if (said.length <= room) return `${said} ${whole}`;
  const cut = said.slice(0, room);
  const end = cut.lastIndexOf(". ");
  return end > 0 ? `${cut.slice(0, end + 1)} ${whole}` : whole;
}
