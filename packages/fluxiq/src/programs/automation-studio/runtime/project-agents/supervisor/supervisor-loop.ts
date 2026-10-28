// The project supervisor (automation-project-agents-plan.md, `Role Model`,
// unit A5a): the agent that plans a Flow's build, briefs a builder per
// subflow, reads what each hands back, assembles the whole candidate and
// tests it. It never acts on the target and never writes a step.
//
// It is the evidence loop the candidate authoring loop runs
// (`../../flow-bootstrap/candidate/authoring-loop.ts`) with the supervisor's
// tools: the harness's observe-only tools (`./role-tools.ts`), its own
// `project.*` tools and the whole candidate's trial (`./tools.ts`), each
// intercepted in `executeTool`, and its own completion (`./completion.ts`).
// It plans rather than acts (`./planning.ts`, t569): its own tools are its
// planning tools, its looks run out after its look budget, and every note the
// loop gives it names its next planning step rather than an act.
// Draft and dry run are off -- the supervisor takes no step a Flow could keep
// -- and it is not discovery-only, which is a candidate builder's mode. No
// `budget` wrap-up: the purse and `maxIterations` bound it.
//
// Its decisions and the whole trial's judge run in a purse run frame of their
// own (`../../llm/build-purse/run.ts`), so a refusal the supervisor met is its
// own and ends it honestly, and inside `withAutomationStudioProjectAgent`
// with the role `supervisor`, so the chat and the step log say which agent
// did the work. A builder's own frame, opened by the dispatcher inside this
// one, is innermost and wins for the builder's work.
//
// The build record is written as the run goes, never at the end, and read
// first: a supervisor started again on a build under way sees its plan,
// briefs and returns. The run ends with a candidate that passed its whole
// trial, for the caller to promote and then end the record `promoted`, or
// with an ending it recorded itself: the honest ending the model gave, the
// money running out, a cancel, or a loop that stopped short. Every ending
// names, in Core's words, what this build still has on the target
// (`./left-on-target.ts`).
//
// **A loop a guard stopped still ends, naming what is left (t586; t775).**
// Bigbox `run-mv85vjqo` stalled on the refusal-run guard: under
// `propagateDecisionErrors` the stall is thrown out of the loop, so no ending
// was recorded and the build's acts stayed on the site untold. The stall the
// loop's `unusableDecisions` builds is now known when it is thrown; that one,
// and a loop that returned stopped short, end the way the model's honest
// ending does (`./completion.ts`): the ending names what of the build is still
// on the target. Since t775 (user, 2026-10-27: reset as rarely as possible)
// Core sends no cleanup reset of its own before an ending (`resetBeforeEnding`
// is retired); the person is told what is left and may ask for it to be put
// back. A thrown stall is then thrown on, so the caller ends the build as it
// did.
//
// **A run has a time limit, and reaching it is an ending too (t592).** A
// project build ran under no bound of its own: the Lab's chat stopped watching
// A8 launch 7's builds at a candidate build's deadline while they still worked.
// The bound is Core's, `AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS`
// (`../../loop-limits/project-build-duration.ts`, which says what counts), and
// its clock starts as this function is called, before the record is read. The
// supervisor's work -- the loop, every builder a dispatch runs and every whole
// trial -- runs under a signal that aborts `AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS`
// before the bound: a builder in flight is stopped and comes back stopped, as on
// a cancel, and the loop ends. That is not the person's cancel: the build ends
// as a guard's stop does, through the ending naming what is left, under a
// second signal that aborts at the bound itself. The outcome says
// `timedOut`. A supervisor started again on a build under way starts a clock of
// its own. Its two timers are set on the clock it is handed
// (`AutomationStudioProjectSupervisorClock`, t616): production always runs on
// the real clock; a test that must reach the bound at an exact point of a build
// hands its own, which the project build passes through
// (`../../service/project-build/run.ts`), so the deadline is reached by the
// test's signal and never by machine load.
//
// **A whole test the time left cannot cover is not started (G2).** The clock
// also tells the time (`now`; the real time where a test's clock does not), and
// the whole test reads from it how long each test took and how much working
// time is left (`./whole-trial.ts`). The outcome says, for a latest revision
// with no verdict of its own, the latest finished test of the same Flow
// (`sameFlowTrial`) and whether a test of it the deadline cut came after
// (`trialCut`), so the ending says what was tested rather than "never tested".
//
// **A pass the run rescued still stands (social debug, t603).** When the latest
// whole test passed only on the run's own recovery from what the Flow does not
// answer, and the build's money, time or turns ran out before its repair was
// made, the run ends `candidate` on that test, not as an ending: the person is
// told the Flow relies on the run's own recovery and why (`./completion.ts`),
// and the outcome carries it (`reliesOnRecovery`).
//
// **Every guard-forced end keeps that pass (A8 social `run-mv96rz6h`, t622).**
// The supervisor's repair of a rescued pass came back short, its completions
// were refused on their shape until the repeat guard stalled the loop, and a
// stall was not one of the shortfalls above, so the build ended with no Flow
// although its latest whole test had passed. A repair that fails never loses a
// passing Flow: every end a guard forced -- money, time, turns, a stall the
// loop threw, any other loop that stopped short, a provider that stopped
// answering -- completes on a standing rescued pass the same way, with its own
// reason (`stalled`, `provider`). A stall on a question put to the person
// (`permission_required`, `user_intervention_required`) counts too: the person
// declining a later step is not the person cancelling the build, and the pass
// was already made under what they permitted. A model's honest ending while
// the pass stands completes on it as well (`./completion.ts`, `ended`). Only
// the person's cancel does not.
//
// **A rescued pass outlives a later assembly (A8 wave 9 social `run-mv9ml775`,
// t637).** When the repair of a rescued pass came back done and the Flow
// assembled from it never passed its whole test, the most recent rescued pass
// stays the build's fallback (`./state.ts`, `standingRescue`) until a later
// pass replaces it. Every guard-forced end above completes on it as on
// the latest assembly's own, and the run hands its caller the fallback's own
// Flow and its own yes (`completedOn`), never the later assembly, so the
// caller promotes the revision that passed. What of the build is still on the
// target is named after the person's words (t775: no cleanup reset). The
// person's cancel still completes on nothing.
// The fallback is the most recent pass of either kind (coordinator, t637): an
// outright one completes the same way, said plainly (`completedOnPass`). So
// does the latest assembly's own outright pass when a guard ends the loop
// before the supervisor completed on it (`latestPass`): a standing pass is
// Core's evidence however the loop stopped, as t611 holds for a brief. The
// person is told the supervisor stopped before completing, then what stopped
// it, and the person's cancel completes on nothing.
//
// **A provider that stopped answering is said as that (t621).** A8 canary
// `run-mv8zw5l2-98064abf`: the model provider answered none of the
// supervisor's decisions, and the loop ended
// `llm_evidence_loop.provider_unavailable`. Its ending names, in Core's words,
// every act of this build still on the target, so the person knows what to
// take back. Its record reason says the provider stopped answering, under the code
// the person's ending carries (`flow_bootstrap.provider_unavailable`), never
// "the supervisor stopped".
import { AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialResult, type AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioLlmBuildPurseRun, AutomationStudioLlmBuildPurseRefused } from "../../llm/build-purse/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceLoopResult } from "../../llm/evidence-loop.ts";
import type { AutomationStudioLlmEvidenceLoopProviderUnavailable } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS, AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS } from "../../loop-limits/index.ts";
import { withAutomationStudioProjectAgent } from "../attribution/index.ts";
import type { AutomationStudioProjectBuildEnding } from "../record/index.ts";
import { automationStudioProjectSupervisorAssembleTool } from "./assemble-tool.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_COMPLETION_SCHEMA, automationStudioProjectSupervisorCompletion, automationStudioProjectSupervisorReliesOnRecovery, type AutomationStudioProjectSupervisorEnded } from "./completion.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { automationStudioProjectSupervisorDispatchTool } from "./dispatch-tool.ts";
import { automationStudioProjectSupervisorLeftOnTarget } from "./left-on-target.ts";
import { automationStudioProjectSupervisorPlanTool } from "./plan-tool.ts";
import { automationStudioProjectSupervisorPlanning } from "./planning.ts";
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";
import { automationStudioProjectSupervisorReadTask } from "./read-task.ts";
import { automationStudioProjectSupervisorHostTools } from "./role-tools.ts";
import { automationStudioProjectSupervisorStopReason } from "../stop-reason/index.ts";
import { AutomationStudioProjectSupervisorState, type AutomationStudioProjectSupervisorCompletedOnPass, type AutomationStudioProjectSupervisorRecoveryShortfall, type AutomationStudioProjectSupervisorReliesOnRecovery } from "./state.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "./tool-ids.ts";
import { automationStudioProjectSupervisorTools } from "./tools.ts";
import { AutomationStudioProjectSupervisorWholeTrial } from "./whole-trial.ts";

/** What the supervisor's loop is given of the evidence loop: everything the supervisor does not set itself. */
export type AutomationStudioProjectSupervisorLoopInput = Omit<AutomationStudioLlmEvidenceLoopInput,
  "draft" | "dryRun" | "discoveryOnly" | "checkCompletion" | "completionSchema" | "fullRunRequired" | "budget" | "purse" | "callScope" | "finishingTools" | "planning" | "signal" | "recoverStall">;

/** How a supervisor run ended. Never promotion: `candidate` hands the caller a candidate to promote. */
export type AutomationStudioProjectSupervisorOutcome = {
  /** Absent only when the purse refused a call before the loop could say how it ended. */
  loop: AutomationStudioLlmEvidenceLoopResult | undefined;
  /** `candidate`: completed on a yes for the latest assembled revision (or, with no trial runner, on that draft); `ended`: the ending below was recorded. */
  status: "candidate" | "ended";
  candidate: AutomationStudioFlowCandidate | undefined;
  trial: AutomationStudioCandidateTrialResult | undefined;
  ending?: AutomationStudioProjectBuildEnding;
  /** Present when the run reached its time limit before a candidate passed (header). */
  timedOut?: true;
  /** `candidate` only: a whole test passed only on the run's own recovery -- the latest assembly's, or the build's fallback, whose Flow is then `candidate` (t637) -- and its repair could not be made; what the person was told (header, t603). */
  reliesOnRecovery?: AutomationStudioProjectSupervisorReliesOnRecovery;
  /** `candidate` only: completed on a fallback that passed its whole test outright, whose Flow is then `candidate`; what the person was told (header, t637). */
  completedOnPass?: AutomationStudioProjectSupervisorCompletedOnPass;
  /** The latest finished whole test of the same Flow (digest), never a yes, when the latest revision has no verdict of its own (header, G2). */
  sameFlowTrial?: AutomationStudioCandidateTrialResult;
  /** A test of the latest revision's Flow was cut by the time limit after its latest finished one, or with none finished (header, G2). */
  trialCut?: true;
  promotionAllowed: false;
};

/** How long one supervisor run may take, whole, and the last part of that kept for its ending (header). Core's constants unless a test says otherwise. */
export type AutomationStudioProjectSupervisorTimeLimit = { maxMs: number; endingMs: number };

/** Sets and clears the time limit's two timers (header). A handle is whatever `setTimeout` returned, handed back to `clearTimeout`. */
export type AutomationStudioProjectSupervisorClock = {
  setTimeout(fire: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** The time now, in milliseconds, on the clock the timers run on (header, G2); the real time when absent. */
  now?(): number;
};

/** The real clock, read at each call so a test's fake timers still apply. */
export const AUTOMATION_STUDIO_PROJECT_SUPERVISOR_REAL_CLOCK: AutomationStudioProjectSupervisorClock = Object.freeze({
  setTimeout: (fire: () => void, ms: number): unknown => setTimeout(fire, ms),
  clearTimeout: (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: (): number => Date.now()
});

const TIME_LIMIT: AutomationStudioProjectSupervisorTimeLimit = Object.freeze({ maxMs: AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS, endingMs: AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS });

type SupervisorInput = {
  ports: AutomationStudioProjectSupervisorPorts;
  loop: AutomationStudioProjectSupervisorLoopInput;
  /** Wraps the loop's input before it runs, as the candidate loop's `observe` does, for the chat. */
  observe?: ((loop: AutomationStudioLlmEvidenceLoopInput) => AutomationStudioLlmEvidenceLoopInput) | undefined;
  timeLimit?: AutomationStudioProjectSupervisorTimeLimit | undefined;
  /** The timers the time limit is kept by (header, t616); the real clock unless a test holds its own. */
  clock?: AutomationStudioProjectSupervisorClock | undefined;
};

export async function runAutomationStudioProjectSupervisorLoop(input: SupervisorInput): Promise<AutomationStudioProjectSupervisorOutcome> {
  // The clock starts here, before the build record is read (header).
  const clock = startClock(input.timeLimit ?? TIME_LIMIT, input.clock ?? AUTOMATION_STUDIO_PROJECT_SUPERVISOR_REAL_CLOCK);
  try {
    return await supervise(input, clock);
  } finally {
    clock.stop();
  }
}

/** The run's two time signals (header): `work` aborts `endingMs` before the bound, `whole` at it; `time` reads how much working time is left (G2). */
type Clock = { limit: AutomationStudioProjectSupervisorTimeLimit; work: AbortSignal; whole: AbortSignal; time: { now(): number; workLeftMs(): number }; stop(): void };

function startClock(limit: AutomationStudioProjectSupervisorTimeLimit, timers: AutomationStudioProjectSupervisorClock): Clock {
  const work = new AbortController();
  const whole = new AbortController();
  const reached = () => new DOMException("The project build reached its time limit.", "TimeoutError");
  const workMs = Math.max(0, limit.maxMs - limit.endingMs);
  const now = (): number => timers.now?.() ?? Date.now();
  const workEndsAt = now() + workMs;
  const handles = [timers.setTimeout(() => work.abort(reached()), workMs), timers.setTimeout(() => whole.abort(reached()), limit.maxMs)];
  return { limit, work: work.signal, whole: whole.signal, time: { now, workLeftMs: () => (work.signal.aborted ? 0 : workEndsAt - now()) }, stop: () => handles.forEach((handle) => timers.clearTimeout(handle)) };
}

async function supervise(input: SupervisorInput, clock: Clock): Promise<AutomationStudioProjectSupervisorOutcome> {
  const { ports } = input;
  const signals = [ports.signal, ports.submission.signal].filter((value): value is AbortSignal => value !== undefined);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  // The supervisor's work stops at the work deadline (header). It is not the person's cancel.
  const working = AbortSignal.any([...signals, clock.work]);
  const outOfTime = (at: AbortSignal) => at.aborted && !signal?.aborted;
  const state = new AutomationStudioProjectSupervisorState();
  const view = await ports.record.read(ports.build);
  if (view?.record.ending) throw new Error("project.record_ended");
  if (view) state.load(view);
  else await ports.record.create({ ...ports.build, instructionDigest: ports.instructionDigest, sourceIds: ports.sources.map((source) => source.sourceId) });
  // The judged whole run and one repair round are kept back from every builder's allowance (`Allowance`).
  if (ports.purse && ports.reserve) {
    ports.purse.keepBackForJudging(ports.reserve);
    // The build's own finishing is kept from every builder's share of the calls, as judging is (t570).
    if (ports.finishing) ports.purse.keepBackCallsFromAllowances(ports.finishing.supervisorCalls + ports.finishing.resetCalls);
    if (!view?.record.allowances.some((allowance) => allowance.role === "supervisor")) await ports.record.recordAllowance(ports.build, { role: "supervisor", usd: ports.purse.keptBackUsd() });
  }
  const controller = new AutomationStudioFlowCandidateSubmissionController(signal ? { ...ports.submission, signal } : ports.submission);
  // The whole trial's gate puts the target back as a candidate build's does: start hook first, then the build's ledgers (`./whole-trial.ts`).
  const wholeTrial = new AutomationStudioProjectSupervisorWholeTrial({ ports, state, time: clock.time });
  // The task's parts and their typed effects, and the parts each subflow serves, for the whole test's one targeted refusal (t775).
  const changeParts = () => state.taskSpec && state.structure ? { parts: state.taskSpec.parts.map((part) => ({ id: part.id, ...(part.effect ? { effect: structuredClone(part.effect) } : {}) })), partsOf: (key: string | undefined) => (key === undefined ? [] : state.structure?.partOf[key] ?? []) } : undefined;
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => controller.latest(), trial: ports.trial, signal, reset: wholeTrial.reset, changeParts });
  // One whole test for every path that tests the whole Flow, timed and remembered once (`./context.ts`, G2).
  const context: AutomationStudioProjectSupervisorContext = { ports, state, controller, gate, signal: working, wholeTest: (value, callSignal) => wholeTrial.test(context, value, callSignal) };
  let ended: AutomationStudioProjectSupervisorEnded | undefined;
  const checkCompletion = automationStudioProjectSupervisorCompletion(context, (ending) => {
    ended = ending;
  });
  const own = automationStudioProjectSupervisorTools();
  // The stall a guard ends the loop with, as the loop's own `unusableDecisions` built it (header).
  let stall: { error: unknown; issueCodes: readonly string[] } | undefined;
  const unusable = input.loop.unusableDecisions;
  const loopInput: AutomationStudioLlmEvidenceLoopInput = {
    ...input.loop,
    ...(unusable ? {
      unusableDecisions: {
        ...unusable,
        stalled: (stalled) => {
          const error = unusable.stalled(stalled);
          stall = { error, issueCodes: [...stalled.issueCodes] };
          return error;
        }
      }
    } : {}),
    draft: false,
    dryRun: false,
    tools: [...automationStudioProjectSupervisorHostTools(input.loop.tools), ...own],
    completionSchema: AUTOMATION_STUDIO_PROJECT_SUPERVISOR_COMPLETION_SCHEMA,
    planning: automationStudioProjectSupervisorPlanning(context),
    executeTool: async (call) => {
      switch (call.toolId) {
        case IDS.readTask: return automationStudioProjectSupervisorReadTask(context);
        case IDS.writePlan: return automationStudioProjectSupervisorPlanTool(context, call.value, "write");
        case IDS.amendPlan: return automationStudioProjectSupervisorPlanTool(context, call.value, "amend");
        case IDS.dispatch: return automationStudioProjectSupervisorDispatchTool(context, call.value);
        case IDS.assemble: return automationStudioProjectSupervisorAssembleTool(context, call.value);
        case IDS.testCandidate: return context.wholeTest!(call.value, call.signal);
        default: return input.loop.executeTool(call);
      }
    }
  };
  if (ports.purse) loopInput.purse = ports.purse;
  loopInput.signal = working;
  const observed = input.observe ? input.observe(loopInput) : loopInput;
  let loop: AutomationStudioLlmEvidenceLoopResult | undefined;
  let outOfMoney = false;
  let stalled: { error: unknown; issueCodes: readonly string[] } | undefined;
  try {
    loop = await withAutomationStudioProjectAgent({ role: "supervisor" }, () => automationStudioLlmBuildPurseRun(ports.purse, () => runAutomationStudioLlmEvidenceLoop({ ...observed, checkCompletion })));
  } catch (error) {
    if (error instanceof AutomationStudioLlmBuildPurseRefused) outOfMoney = true;
    else if (stall && error === stall.error && !signal?.aborted) stalled = stall;
    else if (!outOfTime(clock.work)) throw error;
  }
  // Out of time only when the loop did not complete: a completion or an honest ending given just as the work deadline passed stands.
  const timedOut = !loop?.ok && !outOfMoney && outOfTime(clock.work);
  const done = (status: "candidate" | "ended", recorded?: AutomationStudioProjectBuildEnding): AutomationStudioProjectSupervisorOutcome => {
    // Completed on the build's fallback, the caller is handed its Flow and its yes, not the later assembly's (header, t637).
    const candidate = status === "candidate" && state.completedOn ? structuredClone(state.completedOn) : controller.latest();
    const trial = gate.standing(candidate);
    // What was tested of this Flow, when this revision has no verdict of its own (header, G2).
    const ofFlow = candidate ? wholeTrial.lastOfFlow(candidate.digest) : undefined;
    const earlier = !trial && candidate && ofFlow?.revision !== undefined ? gate.standing({ revision: ofFlow.revision, digest: candidate.digest }) : undefined;
    return {
      loop, status, candidate, trial, ...(recorded ? { ending: recorded } : {}), ...(timedOut ? { timedOut: true as const } : {}),
      ...(earlier && earlier.verdict !== "yes" ? { sameFlowTrial: earlier } : {}), ...(!trial && ofFlow?.cutAfter ? { trialCut: true as const } : {}),
      ...(status === "candidate" && state.reliesOnRecovery ? { reliesOnRecovery: structuredClone(state.reliesOnRecovery) } : {}),
      ...(status === "candidate" && state.completedOnPass ? { completedOnPass: structuredClone(state.completedOnPass) } : {}), promotionAllowed: false
    };
  };
  if (loop?.ok && !ended) return done("candidate");
  // A pass the run rescued still stands when any guard ended the build before its repair; never on the person's cancel (header, t603, t622).
  const shortfall = recoveryShortfall({ outOfMoney, timedOut, stalled: stalled !== undefined, loop });
  // A rescued pass or the fallback, else the latest assembly's own outright pass (header, t637).
  const rescue = shortfall && !signal?.aborted ? state.standingRescue(controller, gate) ?? state.latestPass(controller, gate) : undefined;
  if (shortfall && rescue) {
    const left = rescue.fallback ? automationStudioProjectSupervisorLeftOnTarget(ports).note : undefined;
    automationStudioProjectSupervisorReliesOnRecovery(context, shortfall, { rescue, left });
    return done("candidate");
  }
  const stoppedBy = loop && !loop.ok ? loop.code : stalled ? stalled.issueCodes[0] ?? "stalled" : undefined;
  const cancelled = !timedOut && (signal?.aborted === true || stoppedBy === CANCELLED);
  // The provider stopped answering (header, t621): said as that, and no reset is asked of it.
  const unanswered = !timedOut && !cancelled && loop && !loop.ok && loop.code === PROVIDER_STOPPED ? loop : undefined;
  const finished: AutomationStudioProjectSupervisorEnded | { outcome: "cancelled" | "partial" | "blocked"; reason: string } = outOfMoney
    ? { outcome: state.anyDone() ? "partial" : "blocked", reason: "The Flow's spending limit could not pay for the supervisor's next call, so the build stopped before a whole trial passed." }
    : loop?.ok && ended
      ? ended
      : timedOut
        ? { outcome: state.anyDone() ? "partial" : "blocked", reason: `The build reached its time limit of ${spoken(clock.limit.maxMs)} before a whole trial passed.` }
        : cancelled
          ? { outcome: "cancelled", reason: "The build was cancelled." }
          : unanswered
            ? { outcome: state.anyDone() ? "partial" : "blocked", reason: providerStoppedReason(unanswered.providerUnavailable, automationStudioProjectSupervisorLeftOnTarget(ports).undoable) }
            : { outcome: state.anyDone() ? "partial" : "blocked", reason: automationStudioProjectSupervisorStopReason({ loop, stalledOn: stalled?.issueCodes }) };
  // No cleanup reset before an ending (header, t775): it names what is left.
  // An ending the model gave already names what is left (`./completion.ts`); every other ending Core names it in here.
  const named = finished === ended ? finished : { ...finished, reason: automationStudioProjectSupervisorLeftOnTarget(ports).reason(finished.reason) };
  const recorded = await ports.record.end(ports.build, named);
  if (stalled) throw stalled.error;
  return done("ended", recorded);
}

/** The loop codes that are no guard's: the person's cancel, which never completes on a rescued pass (header). */
const CANCELLED = "llm_evidence_loop.cancelled";
const TURNS = "llm_evidence_loop.iteration_limit";

/**
 * Why a guard ended the loop before a rescued pass's repair was made (header,
 * t622): the purse, the time limit, the turns, the provider, or any other
 * stop a guard forced (`stalled`). Undefined when the loop completed or the
 * model ended it, or the person cancelled it.
 */
function recoveryShortfall(ended: { outOfMoney: boolean; timedOut: boolean; stalled: boolean; loop: AutomationStudioLlmEvidenceLoopResult | undefined }): AutomationStudioProjectSupervisorRecoveryShortfall | undefined {
  if (ended.outOfMoney) return "money";
  if (ended.timedOut) return "time";
  if (ended.stalled) return "stalled";
  const { loop } = ended;
  if (!loop || loop.ok || loop.code === CANCELLED) return undefined;
  return loop.code === TURNS ? "turns" : loop.code === PROVIDER_STOPPED ? "provider" : "stalled";
}

/** The loop code a model provider that stopped answering ends with (`../../llm/unanswered-calls.ts`). */
const PROVIDER_STOPPED = "llm_evidence_loop.provider_unavailable";
/** The code the person's ending for it carries (`../../flow-bootstrap/generation-failure/evidence-failure.ts`, t619), which the record names too. */
const PROVIDER_ENDING_CODE = "flow_bootstrap.provider_unavailable";
/** The provider code said as "could not be reached", as the person's ending says it. */
const UNREACHABLE = "llm.provider_network_error";

/**
 * The record's reason for a loop the provider stopped answering (header,
 * t621), in the words the person's ending uses: what the provider did, how
 * many requests went unanswered, and, where a reset could have undone acts of
 * this build, that none was sent. Core's note of what is left follows it.
 */
function providerStoppedReason(summary: AutomationStudioLlmEvidenceLoopProviderUnavailable | undefined, undoable: boolean): string {
  const inARow = summary?.inARow ?? 1;
  const requests = inARow === 1 ? "a request" : `${inARow} requests in a row`;
  const happened = summary?.codes[0] === UNREACHABLE
    ? `The build stopped because the AI model provider could not be reached: ${requests} got no answer`
    : `The build stopped because the AI model provider did not answer: ${requests} got no answer -- ${summary?.said ?? "it did not answer"}`;
  const reset = undoable ? " No reset was sent to put the target back: it would need the same provider." : "";
  return `${happened}, before a whole trial passed (${PROVIDER_ENDING_CODE}).${reset}`;
}

/** A time limit in words: whole minutes where it is some, else seconds. */
function spoken(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} minutes`;
  const seconds = Math.max(1, Math.round(ms / 1_000));
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}
