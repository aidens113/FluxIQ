import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { emitAutomationStudioProjectReceiptCard } from "../../activity/project/index.ts";
import { automationStudioSiteResetProjectReset, type AutomationStudioSiteResetChecks, type AutomationStudioSiteResetTrialReset } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioProjectSingleSubflowPlan } from "../single-subflow/index.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";
import type { AutomationStudioProjectSupervisorState } from "./state.ts";
import { automationStudioProjectSupervisorToolAnswer as answer } from "./tool-answer.ts";

// `core.test_candidate` for the supervisor: the whole candidate's trial gate
// (`../../flow-bootstrap/candidate/trial-gate.ts`), run under the supervisor's
// purse run frame so its judge spends the reserve no builder could be given.
// Each trial that ran is recorded in the build record as a receipt reference
// and shown in the chat as its receipt card.
//
// **The whole test runs on the target as it stands (t775; user, 2026-10-27:
// reset as rarely as possible).** Social `run-mv85xmgq-8a6a6f43` could never
// test while every act of the build refused the whole test. The gate is given
// this build's reset (`reset`), the one every phase shares
// (`flow-bootstrap/site-reset/project-reset.ts`), asked with no brief of its
// own:
//
// - the start hook first (the gate's `prepareStart`): after it every ledger
//   counts its acts undone, and the trial's evidence names what the hook took
//   back under `absorbedByStartReset`;
// - otherwise the test runs with this build's acts on the target -- in place,
//   kept, or that no call can settle -- said under `startedWith` to its judge,
//   which judges it by what it changed;
// - the one refusal left is targeted: a step whose asked end state another
//   step of this build already made is refused
//   `candidate.trial_starts_in_end_state`, answered here
//   `project.trial_starts_in_end_state`, naming just those acts and the brief
//   that made each, so a reset brief undoes only them (`retry_allowed`).
//   `project.trial_reset_required` and `project.trial_unsettleable` are
//   retired.
//
// **The judged whole run is read like a builder's trial (t775 D5).** It is the
// user's own example: a line at 9 that is 10 after "add 1" passed, with no
// reset. Given Core's own look (`ports.look`,
// `service/project-build/phase-start.ts`), the reset begins the trial's
// readings over every ledger: before each witness of the whole plan's lasting
// steps, the latest fresh read, else a look; after the end view, a look worded
// against the before state, so the domain gives lines; the change, each task
// part's proof from its typed effect, and what of the build was on the site
// from earlier go to the judge under `siteChange`. The supervisor's reset never
// takes the target back to the start (`compare` does nothing): the whole run's
// first step is its arrival (`./assembly.ts`), and there is a look only where
// that arrival exists. Without a look there are no readings; a trial answered
// from the recording never has any.
//
// A whole trial's own acts are recorded under the supervisor by its trial port
// (`service/project-build/whole-trials.ts`), so the reset records none of its
// own; after each trial every ledger starts a new phase. Every project ledger
// is asked per brief (`ports.projectLedger.forBrief`, t590).
//
// **A single-subflow plan's yes is not judged twice (t679).** On a plan of one
// subflow the router runs, the builder's own test was the judged whole run of
// the revision assembled from its proposal (`../single-subflow/single-subflow-trial.ts`).
// A whole test the supervisor then asks of that same revision, while its yes
// stands and may be completed on, runs no second trial: it answers with that
// yes and its `complete` object, records no receipt again, and says to
// complete. A pass the run rescued is tested as before.
//
// **A test the build's working time cannot cover is not started (G2).** Social
// `run-mvfq957o-40103539` asked, with about 2.5 minutes of the build's working
// time left, for a test of a revision whose last test had taken 337 s; the
// work deadline cut it off after 150 s and the build ended a draft. Each test
// that ran is timed on the run's clock (`time`, from `./supervisor-loop.ts`),
// and a test is refused `project.trial_out_of_time` when the working time left
// is less than the same Flow's (same digest's) latest finished test took -- or,
// for a Flow never tested, the build's latest finished test -- with a margin.
// The refusal says how much is left and to end honestly, the last tested
// result kept. Nothing measured yet, or no clock, starts the test as before.
// So that the ending says what was tested, each Flow's latest finished test
// and a later test of it the deadline cut are remembered (`lastOfFlow`): a
// Flow submitted again as a new revision has no verdict of its own, and was
// told as "never tested from its start" although it had been tested whole.
//
// **A test answered from the recording is a no, never a measure of time (P6,
// D48).** The build's whole port is offline-first
// (`service/project-build/whole-trials.ts`): the gate may keep a failure the
// recording of the build's last live test shows for a revision not tried yet,
// with no start hook, no reset and nothing on the site, its evidence marked
// `checkedAgainst`. It is taken as any no here -- a receipt naming the offline
// run, a failed whole test, the Flow's latest finished test -- but it took no
// site time, so the Flow's measured time and the build's latest stay the last
// test that ran on the site (G2). An offline yes never stands: the gate runs
// that revision live in the same call.

/** How much more than its measured time a test is given room for: a fifth, and at least ten seconds (header, G2). */
const TIME_MARGIN = 0.2;
const MIN_TIME_MARGIN_MS = 10_000;

/** The run's clock as a whole test reads it (header, G2): the time now, and how much of the build's working time is left. */
type WholeTrialTime = { now(): number; workLeftMs(): number };

/** One Flow's (digest's) whole tests (header, G2): its latest finished one, and whether a test the deadline cut came after it. */
type FlowTests = { finished?: { revision: number; ms: number | undefined }; cutAfter: boolean };

/** A trial's start as the supervisor checks it: never taken back to the start, which the whole run's arrival does (header). */
const UNLOOKED: AutomationStudioSiteResetChecks = { compare: async () => ({ moved: false }) };

export class AutomationStudioProjectSupervisorWholeTrial {
  /** The reset the whole candidate's gate runs before each trial (header). */
  readonly reset: AutomationStudioSiteResetTrialReset;
  /** Each Flow's whole tests, by its digest (header, G2). */
  private readonly flows = new Map<string, FlowTests>();
  /** How long the build's latest finished whole test took, of any Flow (header, G2). */
  private latestMs: number | undefined;

  constructor(private readonly input: { ports: Pick<AutomationStudioProjectSupervisorPorts, "projectLedger" | "look">; state: AutomationStudioProjectSupervisorState; time?: WholeTrialTime | undefined }) {
    this.reset = this.ledgersReset(input.ports.projectLedger, input.ports.look);
  }

  /**
   * The latest finished whole test of the Flow with this digest -- its revision,
   * undefined when none finished -- and whether a test of it the build's time
   * limit cut came after it; undefined for a Flow never tested (header, G2).
   */
  lastOfFlow(digest: string): { revision: number | undefined; cutAfter: boolean } | undefined {
    const flow = this.flows.get(digest);
    return flow ? { revision: flow.finished?.revision, cutAfter: flow.cutAfter } : undefined;
  }

  async test(context: AutomationStudioProjectSupervisorContext, value: JsonObject, callSignal: AbortSignal | undefined): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const { ports, state, gate } = context;
    // The revision a single-subflow builder's test already judged yes is not tried again (header, t679).
    const judged = this.alreadyJudged(context, value);
    if (judged) return judged;
    // A test the working time left cannot cover is not started (header, G2).
    const outOfTime = this.outOfTime(value.digest);
    if (outOfTime) return outOfTime;
    const signal = callSignal ?? context.signal;
    const started = this.input.time?.now();
    let ran: AutomationStudioLlmEvidenceToolExecutionResult;
    try {
      ran = await gate.test(value, signal);
    } catch (error) {
      // A test the deadline cut is remembered for the ending, after the Flow's latest finished one (header, G2).
      if (signal?.aborted && typeof value.digest === "string") this.flowOf(value.digest).cutAfter = true;
      throw error;
    }
    const evidence = ran.evidence as JsonObject;
    if (evidence.code === "candidate.trial_starts_in_end_state") return this.startsInEndState(evidence);
    if (typeof evidence.verdict !== "string" || typeof evidence.revision !== "number" || typeof evidence.digest !== "string") return ran;
    // A test answered from the recording took no site time (header, D48).
    this.finished(evidence.digest, evidence.revision, evidence.checkedAgainst === "recorded_run" ? undefined : started);
    const verdict = evidence.verdict;
    const receiptId = typeof evidence.trialRunId === "string" && evidence.trialRunId ? evidence.trialRunId : `whole-trial-${evidence.revision}-${Date.now()}`;
    await ports.record.recordReceipt(ports.build, { receipt: { kind: "candidate_trial", receiptId, digest: evidence.digest } });
    emitAutomationStudioProjectReceiptCard({ receipt: { kind: "candidate_trial", receiptId, digest: evidence.digest }, verdict: verdict === "yes" ? "passed" : verdict === "no" ? "failed" : "unconfirmed" });
    // The trial's own acts are in the ledger itself, under the supervisor (header).
    if (verdict !== "yes") state.wholeTrialFailed = true;
    // The most recent pass, rescued or outright, is kept as the build's fallback until a later pass replaces it (`./state.ts`, t637).
    state.noteWholeTest(context.controller, gate);
    return ran;
  }

  /** A test of `digest` refused for the working time left, or undefined when it may start (header, G2). */
  private outOfTime(digest: JsonValue | undefined): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
    const time = this.input.time;
    if (!time) return undefined;
    const same = typeof digest === "string" ? this.flows.get(digest)?.finished?.ms : undefined;
    const measured = same ?? this.latestMs;
    if (measured === undefined) return undefined;
    const left = Math.max(0, time.workLeftMs());
    if (left >= measured + Math.max(measured * TIME_MARGIN, MIN_TIME_MARGIN_MS)) return undefined;
    const took = same !== undefined ? "the last whole test of this same Flow" : "the latest whole test of this build";
    const said = `About ${spoken(left)} of this build's working time is left, and ${took} took about ${spoken(measured)}, so this test could not finish before the build's time limit and was not started.`;
    return answer.refused("project.trial_out_of_time", `${said} ${GUIDANCE.refusals.outOfTime}`, {
      said, workLeftSeconds: Math.round(left / 1_000), lastTestSeconds: Math.round(measured / 1_000), sameFlow: same !== undefined
    });
  }

  /**
   * Records a finished whole test of `digest` and how long it took (header, G2): the Flow's latest finished test, with no
   * cut after it yet. Unmeasured (`started` undefined: no clock, or a test answered from the recording, D48), the Flow
   * keeps the measure of its last test that was.
   */
  private finished(digest: string, revision: number, started: number | undefined): void {
    const flow = this.flowOf(digest);
    const ms = started === undefined || !this.input.time ? undefined : Math.max(0, this.input.time.now() - started);
    flow.finished = { revision, ms: ms ?? flow.finished?.ms };
    flow.cutAfter = false;
    if (ms !== undefined) this.latestMs = ms;
  }

  /** This digest's whole tests, begun empty the first time it is tested (header, G2). */
  private flowOf(digest: string): FlowTests {
    const known = this.flows.get(digest);
    if (known) return known;
    const flow: FlowTests = { cutAfter: false };
    this.flows.set(digest, flow);
    return flow;
  }

  /** The standing yes of a single-subflow plan's latest revision, when `value` names it and it may be completed on (header, t679); undefined otherwise. */
  private alreadyJudged(context: AutomationStudioProjectSupervisorContext, value: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
    const { state, controller, gate } = context;
    if (automationStudioProjectSingleSubflowPlan(state.structure) === undefined) return undefined;
    const latest = controller.latest();
    if (!latest || value.revision !== latest.revision || value.digest !== latest.digest) return undefined;
    const standing = gate.standing(latest);
    if (standing?.verdict !== "yes" || !gate.completion({ revision: latest.revision, digest: latest.digest }).ok) return undefined;
    return answer.answered({
      ok: true, verdict: "yes", revision: latest.revision, digest: latest.digest, ...(standing.trialRunId ? { trialRunId: standing.trialRunId } : {}),
      alreadyJudged: true, complete: { revision: latest.revision, digest: latest.digest }, instruction: GUIDANCE.next.afterWholeAlreadyJudged
    });
  }

  /** The gate's targeted refusal in the supervisor's words (header, t775): a reset brief undoes just the acts listed, each with the brief that made it. */
  private startsInEndState(evidence: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult {
    const owners = new Map(this.input.ports.projectLedger.snapshot().acts.map((act) => [act.act, act.owner]));
    const acts = list(evidence.actsToUndo).flatMap((entry) => {
      const act = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : undefined;
      return typeof act?.act === "string" ? [{ act: act.act, did: typeof act.did === "string" ? act.did : "an act", brief: owners.get(act.act) ?? "unknown" }] : [];
    });
    return answer.refused("project.trial_starts_in_end_state", GUIDANCE.refusals.startsInEndState, { actsToUndo: acts }, { retry: true });
  }

  /** The build's reset over every brief's ledger, with no brief of its own, looking only through Core's own look when given (header). */
  private ledgersReset(ledger: AutomationStudioProjectSupervisorPorts["projectLedger"], look: AutomationStudioProjectSupervisorPorts["look"]): AutomationStudioSiteResetTrialReset {
    const shared = automationStudioSiteResetProjectReset({ project: ledger, checks: (signal) => (look ? { ...UNLOOKED, lookAt: look(signal) } : UNLOOKED) });
    return {
      admit: (steps) => shared.admit!(steps),
      beforeTrial: (signal, cannotUndo, options) => shared.beforeTrial(signal, cannotUndo, options),
      trialRan: (_acts, trialRunId) => shared.trialRan([], trialRunId)
    };
  }
}

/** A span of time in words (header, G2): seconds under a minute and a half, else minutes to the nearest half. */
function spoken(ms: number): string {
  if (ms < 90_000) {
    const seconds = Math.round(ms / 1_000);
    return seconds === 1 ? "1 second" : `${seconds} seconds`;
  }
  return `${Math.round(ms / 30_000) / 2} minutes`;
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
