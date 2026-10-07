// A build's three phases, where the first stops before the Flow is ready.
//
// **The user's lifecycle, binding (2026-09-30).** (1) Live exploration and the
// authoring of an intelligent draft. (2) Once the model says the Flow is
// ready, test it and judge its result. (3) Repair it, or declare it finished,
// or -- "ONLY IF THERE IS ABSOLUTELY NO WAY TO ACHIEVE IT" -- declare it not
// doable for a stated reason.
//
// **What was wrong (audit A3, cause 1: 30 live runs).** A build whose first
// phase stopped short -- out of decisions, stalled on refused completions,
// stopped by its no-progress guard -- just ended, as
// `evidence_unusable_decision` or `evidence_iteration_limit`. It never reached
// a test, a judgement, a repair or a "not doable": the person saw "Build
// failed" and nothing after. `run-muog33va-96469cb2` stopped with 25 of 64
// calls, $0.06 of its $0.25 ceiling and 398 s of 540 s still unused.
//
// **What happens now.** A round that stops short with steps in its Flow goes
// to phase 2 with what it has: the Flow so far is tested from its start and
// judged against the checklist (`./judgement.ts`). Then phase 3: a repair round, live, seeded with
// that Flow and told the judgement, working on what is missing or failing with
// the same checklist. When the model says the Flow is ready the loop tests it
// as it always does; a Flow it accepts is the build's result. A repair that
// stops short is judged again, and another repair follows while each gets
// further than the judgement before it. One that gets no further ends the
// build not finished: the Flow so far kept, what stood still, and what the
// judge said is left to change (`./not-finished.ts`).
//
// **"Not doable" only if there is absolutely no way (user; t195-w37, cause
// R11).** Live run `run-murwcaj0-40e56557`: round 0's judge said no, still
// achievable, add a read after the confirm loop; round 1's judge said no,
// still achievable, with a different finding and its fix; the no-progress stop
// then ended the build "I could not build this Flow, and I found no way to",
// with $0.0106 of its $0.10 purse left. Now the build ends "not doable" only
// when the latest judge says what was asked can no longer be had
// (`stillAchievable: "no"`, `./not-doable.ts`) -- the one no-way condition
// kept. The no-progress stop and the refused-repeats stop end it not finished.
// And a judge who says no, with the result still achievable or unsure, and
// names the fix, buys one more round after a round without measured progress,
// if the purse funds it; two such rounds in a row end the build not finished.
//
// **Repairs are bounded by money and progress, not by a count (t240).** Two
// repairs used to be the most a build made, whatever they did, and the earbuds
// build `run-muqiho7e-13be6c03` was stopped at that count. Now another round
// opens only when (a) the purse can fund the judging of its Flow -- two judge
// calls, each at the largest judge hold priced -- and the least its first
// decision can be held at, the decision itself priced from its own request
// when it is sent (`./round-funding.ts`, t254), and (b) the round before it
// measurably progressed by what the test and the judge report
// (`./progress.ts`) -- or, once, did not after a judge who named the fix
// (t195-w37). A round that did not otherwise ends the build not finished,
// saying what stood still. A round that ended on refused repeats and handed
// back the very Flow it started from ends it too: a second round would repeat
// it exactly (run 38, cause C8); for the first round of an extend build the
// Flow it started from is the caller's (`seedSignature`). The live-round backstop
// (`AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS`) still bounds every build, as
// the published record's reader is bounded by it.
//
// **A round that stops with nothing in its Flow never ends the build while
// budget remains (supervisor, t208).** It was the main case -- 57 of 117 live
// builds ended with no Flow (audit A1) -- and it used to end as a bare
// `evidence_unusable_decision` or `evidence_iteration_limit`. Now the model is
// told plainly that nothing is in the Flow yet, with the checklist all to do,
// and keeps exploring live from the page as it stands, round after round,
// until a Flow is accepted or a budget runs out; the budget ending then says
// what was tried, how far it got and what blocked it. "Not doable" is never
// reached from an empty Flow: it needs a judge's word on a tested one.
//
// **A build finishes only on a judged success of the Flow as it finally
// stands (user, 2026-10-02, binding).** With a `judge`, what the loop's test of
// the Flow did is judged against the instruction, and a finished round is the
// build's result only when the verdict is `yes` *and* its `flowSignature` -- the
// Flow signature of the test it judged (`../../flow-draft/flow-signature.ts`,
// stamped by the service's judge) -- is the signature of the Flow the round
// finished with. Every other verdict is a round judged wrong and is repaired
// as a round that stopped short is, under the same funding, progress and round
// bounds, with the judge's account: `no`; `unknown` and `not_judged` as they
// are; and a `yes` about another version of the Flow, or about no test at all,
// as `not_judged` in Core's words. An unsure verdict used to finish the build
// "unverified", and a re-authored Flow whose carried steps were never run was
// approved and applied before anything ran it whole (run 41,
// `run-muq70foz-74caa189`); now those steps are run again live in a repair
// until a test of the whole Flow is judged. A purse that cannot fund another
// decision and judge ends the build at its budget, with the Flow kept; "not
// doable" still needs a judge's word that it can no longer be had. A build given no `judge`
// is unchanged: a Flow the loop accepts is its result, unjudged. The judge's
// calls are held against the build's purse like every other call, and it is
// asked within what the purse has left. The yes a build finishes on is kept on
// the finished outcome as a record (`./finishing-verdict.ts`, cause R2), with
// any advice the judge gave beside it as unconfirmed: the build decides from the
// verdict and its `flowSignature` alone, and a yes's advice is never a repair
// directive (cause 10, `run-murwd8le-79e735a8`).
//
// **A round that could not be measured never ends the build "not doable"
// (t194-w70).** A re-author or extend build seeds its draft from a stored Flow,
// and a step carried from it has nothing it ran with and nothing to put the
// target back with until it is rerun live; Core never runs it itself (the
// permission gate). A round whose Flow still holds one is not tested at its end
// (`./judgement.ts`, `notRunInThisBuild`), so it has no measurement, and
// neither `repeated_unchanged` nor `no_progress` is concluded from it: live run
// murwcmx2's re-author stopped twice on unusable decisions with the advised fix
// rerun in its draft, both rounds `not_tested`, and ended not doable comparing
// them -- the fix never ran from the Flow's start. Such a round is repaired
// again, told which steps have not run (`../../llm/evidence-loop/resume.ts`),
// under the same money and round bounds; its progress is fewer steps not run or
// a changed Flow (`./progress.ts`), which the announcement says. When money or
// the round limit runs out first, the budget ending says the Flow as it stands
// was never run whole, naming those steps (`./not-done.ts`).
//
// **Unreadable replies end the build only as that (t211).** Each reply the
// loop could not read is asked again; an unbroken run of them ends the round
// as `unreadable`, and the build with a message saying so and how many tries
// it took (`./replies-unreadable.ts`) -- never "not doable", and never a bare
// code.
//
// **A budget is never "not doable".** A round stopped by the spend ceiling,
// the token budget or the deadline -- or a repair that has none of them left to
// start with -- ends the build as exactly that (`./budget-exhausted.ts`). Each
// repair is given only what the rounds before it left of the build's tokens and
// time, and of a call count the Flow's settings declared. The decision
// backstop is not such a budget: each round meets it on its own.
//
// **Cost is one purse's (t234).** The ceiling is a Flow creation's --
// FLUXIQ_LLM_RUN_COST_CEILING_USD, $0.10 unless set -- held by one purse opened
// for the build with what earlier builds of the Flow spent
// (`../../llm/build-purse/purse.ts`). Every round, its test and the judge draw
// from that purse, and no round is given a fresh share of it: each round's
// budget keeps the whole ceiling, the purse holds each call at its worst case,
// and its refusal is the only cost ending. With a judge, the judging pair is
// kept back from every other call from the build's start (t254), so no round
// can spend what its judging needs. A repair is not started once the purse
// cannot fund its judging and the least of a first decision, the judge is
// asked within what it has left, and a cost ending's figures are the purse's. A build given no purse keeps the
// older arithmetic: each repair is given what the rounds before it left of the
// cost budget too.
//
// **What the purse charged is what the build records (t254, stage 2).** A judge
// call whose reply cost more than it was held at is a breach on the purse, like
// a decision's. The judge's spend arrives as a verdict, so its breaches and
// overshoot are read off the purse across the judge's calls and added to the
// build's accounting beside its spend (`budgetBreaches`, `budgetOvershootUsd`).
//
// **The judging reserve is spent judging, never left (t254, stage 2).** A round
// stopped because its next call would have eaten into the judging kept back
// (a cost refusal with `keptBackUsd`) does not end the build with that reserve
// unspent: the Flow as it stands is tested from its start and judged with it
// (`./reserve-judging.ts`). A yes about that Flow finishes the build; anything
// else ends it at its budget with the judge's account and the Flow kept as a
// draft -- never "not doable" from there.
//
// **A Flow a judge said no to is not judged again unchanged (t254 stage 3).**
// Where the round the reserve stopped holds the very Flow a judge of this build
// last said no to -- the same Flow signature as the test that judge judged, as
// in murzln6g's repair refused its first decision, whose draft was still the
// seed round 0's judge said no to -- nothing is spent: no test, no judge. The
// build ends at its budget with that judge's findings and advice, saying the
// reserve was not spent because the Flow was unchanged since, and the Flow kept
// as a draft; never "not doable", whatever that judge said of it.
//
// **A round that stopped short is judged before the build ends (t195-w42).**
// Live run `run-musp474o-e0ed7432`: round 1 was judged no with the fix named;
// round 2 applied it, stopped on refused repeats without `complete`, and its
// different Flow ran clean from its start -- but was judged from the checklist
// alone, found no further than round 1's judged judgement, and the build ended
// not finished with about $0.05 of its $0.10 unspent and that Flow never judged.
// Now a round that stopped short (not a budget stop) whose Flow ran clean, can
// be built as it stands, and is not the Flow a judge last said no to, is put to
// the judge with the reserve kept for it (`./reserve-judging.ts`). A yes about
// that Flow finishes the build; any other verdict is the round's judgement, and
// phase 3's rules apply to it unchanged.
//
// Everything that decides a round belongs to the caller (`round`, `test`):
// this module never calls a provider or runs a tool itself, and every ending
// the caller's loop raises that is not a stall -- a permission ask, a person
// needed, a provider failure -- passes through untouched.
import { automationStudioFlowDraftFlowSignature, automationStudioFlowDraftReplaySignature, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopBudget, AutomationStudioLlmEvidenceLoopExhaustion, AutomationStudioLlmEvidenceLoopProviderUnavailable, AutomationStudioLlmEvidenceLoopResult, AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceLoopUnreadable } from "../../llm/index.ts";
import type { AutomationStudioLlmEvidenceLoopResume } from "../../llm/evidence-loop/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioFlowBootstrapBudgetBound, AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioFlowBootstrapIncompleteDraftPointer } from "../incomplete-draft/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS } from "../../loop-limits/index.ts";
import { automationStudioLlmStepLogScope } from "../../llm/step-log/index.ts";
import { automationStudioFlowBootstrapBudgetExhausted, type AutomationStudioFlowBootstrapCostSpending, type AutomationStudioFlowBootstrapNextRoundHold } from "./budget-exhausted.ts";
import type {
  AutomationStudioFlowBootstrapJudgeSpend,
  AutomationStudioFlowBootstrapJudgedWrong,
  AutomationStudioFlowBootstrapJudgement,
  AutomationStudioFlowBootstrapNoRouteLeft,
  AutomationStudioFlowBootstrapRoundProgress,
  AutomationStudioFlowBootstrapStoodStill,
  AutomationStudioFlowBootstrapTestVerdict,
  AutomationStudioFlowBootstrapUnfinishedStop
} from "./contracts.ts";
import {
  automationStudioFlowBootstrapJudgeFinished,
  automationStudioFlowBootstrapJudgeUnfinished,
  automationStudioFlowBootstrapJudgementValue,
  automationStudioFlowBootstrapRepairSeed,
  automationStudioFlowBootstrapYesNotAboutThisFlow,
  type AutomationStudioFlowBootstrapUnfinishedTest
} from "./judgement.ts";
import { automationStudioFlowBootstrapFinishingVerdict, type AutomationStudioFlowBootstrapFinishingVerdict } from "./finishing-verdict.ts";
import { automationStudioFlowBootstrapNotDoable } from "./not-doable.ts";
import { automationStudioFlowBootstrapNotFinished } from "./not-finished.ts";
import { automationStudioFlowBootstrapJudgementProgress, automationStudioFlowBootstrapJudgementUnmeasured } from "./progress.ts";
import { automationStudioFlowBootstrapRepliesUnreadable } from "./replies-unreadable.ts";
import { automationStudioFlowBootstrapJudgeAtReserve } from "./reserve-judging.ts";
import { automationStudioFlowBootstrapProviderUnavailable } from "./provider-unavailable.ts";
import { automationStudioFlowBootstrapRepairingJudgedSaid, automationStudioFlowBootstrapRepairingNotRunSaid, automationStudioFlowBootstrapStopSaid, automationStudioFlowBootstrapTestReachSaid } from "./not-done.ts";
import { automationStudioFlowBootstrapRoundEnding } from "./round-ending.ts";
import { automationStudioFlowBootstrapRoundFunding } from "./round-funding.ts";
import { AutomationStudioFlowBootstrapUnfinishedStall } from "./unfinished-stall.ts";

/** The least time worth starting a repair with: a look, a few decisions and the test. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MIN_REPAIR_MS = 30_000;

/** What a purse has left at most and still counts as spent: the purse's own floating-point slack. */
const PURSE_EMPTY_USD = 1e-9;

/** What one live round is given. */
export type AutomationStudioFlowBootstrapRoundRequest = {
  /** 0 for the exploration, then each repair. */
  round: number;
  /**
   * What the build has left: the whole budget for the exploration, what the
   * rounds before left for a repair. With a purse its cost stays the whole
   * ceiling: the purse, not this figure, holds what is left of it.
   */
  budget: AutomationStudioLlmEvidenceLoopBudget;
  /** The build's purse, for the caller to hand its loop: every round draws from this one. Absent where the build was given none. */
  purse?: AutomationStudioLlmBuildPurse | undefined;
  /** The round's decision backstop. */
  maxIterations: number;
  /** A repair's seed and the entry its first decision reads. Absent for the exploration. */
  repair?: { seed: AutomationStudioFlowDraftStep[]; resume: AutomationStudioLlmEvidenceLoopResume };
  /**
   * The ending for a round whose decisions kept coming back unusable: the
   * caller's loop returns it from `unusableDecisions.stalled`, after any ending
   * of its own (a permission ask, a person needed), so the loop throws it.
   */
  stalled(progress: AutomationStudioFlowBootstrapUnfinishedStall["progress"]): AutomationStudioFlowBootstrapUnfinishedStall;
};

export type AutomationStudioFlowBootstrapBuildPhasesInput = {
  round(request: AutomationStudioFlowBootstrapRoundRequest): Promise<AutomationStudioLlmEvidenceLoopResult>;
  /** The loop's own test of a Flow, over the steps it is given. */
  test: AutomationStudioFlowBootstrapUnfinishedTest;
  replayable(steps: readonly AutomationStudioFlowDraftStep[]): boolean;
  checklist(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioInstructedActChecklistItem[] | undefined;
  /** The whole build's budget: what every round together may spend. */
  budget: AutomationStudioLlmEvidenceLoopBudget;
  /**
   * The build's purse (`../../llm/build-purse/`): the Flow creation's cost
   * ceiling and what earlier builds of it spent. Handed to every round; the
   * cost check before a repair, the judge's budget and a cost ending's figures
   * are read from it. Absent: each round is given what the rounds before left.
   */
  purse?: AutomationStudioLlmBuildPurse | undefined;
  /** The decision backstop of one round. */
  maxIterations: number;
  /** A call count the Flow's settings or the resolver declared, which the whole build is held to. */
  declaredCalls?: number | undefined;
  /** Keep the Flow so far for a later build (`../incomplete-draft/`), and say where. */
  keep(stopped: AutomationStudioLlmEvidenceLoopResume["stopped"], outstanding: readonly string[], steps: readonly AutomationStudioFlowDraftStep[], completionAttempts: number): Promise<AutomationStudioFlowBootstrapIncompleteDraftPointer | undefined>;
  /**
   * An ending of the caller's own that a stopped round raised -- a question put
   * to the person (a permission ask, a check only they can pass) -- returned as
   * the error to end the build with. It wins over exploring again or repairing:
   * the build waits on the person's answer, never spends past it.
   */
  callerEnding?(progress: AutomationStudioFlowBootstrapRoundProgress): unknown;
  /**
   * Judge a finished round: whether what the Flow's test from its start did is
   * what the instruction asks, within what the build has left. Throws an
   * `AbortError` when the build is cancelled. Absent: a Flow the loop accepts
   * is the build's result, unjudged.
   */
  judge?(input: { round: number; loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }>; budget: AutomationStudioLlmEvidenceLoopBudget }): Promise<AutomationStudioFlowBootstrapTestVerdict>;
  /**
   * Whether the Flow a round left when it stopped -- on the judging reserve, or
   * short of a completion -- can be built as it stands -- the completion check a
   * finished round's Flow passes -- and, where it can, make it the plan the caller builds should the build
   * finish with it (`./reserve-judging.ts`). Asked before that Flow is judged:
   * a yes about a Flow that cannot be built would finish nothing. Absent: it can.
   */
  acceptStopped?(loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }>): Promise<boolean>;
  /** Tell the person the build moved to a phase: the chat's row for it. */
  announce?(event: { phase: "exploring" | "verifying" | "repairing"; label: string; text: string }): void;
  /**
   * The replay signature (`automationStudioFlowDraftReplaySignature`) of the
   * Flow the first round starts from, where it starts from one -- an extend
   * build's seeded Flow. A first round that ends on refused repeats and hands
   * it back unchanged ends the build rather than open an identical second
   * round (run 38, cause C8). Absent: the first round starts from nothing.
   */
  seedSignature?: string | undefined;
  /** Live rounds in all, the exploration included: at most `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS` (`../../loop-limits/`), which the published record's reader is bounded by. */
  maxRounds?: number;
  now?: () => number;
};

export type AutomationStudioFlowBootstrapBuildPhasesOutcome =
  /** A Flow the loop accepted, and what every round spent. */
  | {
    kind: "finished";
    loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }>;
    accounting: AutomationStudioLlmEvidenceLoopAccounting;
    rounds: number;
    /**
     * Every round's trace rows, numbered across the build: what a Flow
     * accepted after a repair stores as its record. `loop.trace` is the last
     * round's alone, which is how a build that explored, was judged and was
     * repaired kept only its repair's decisions (t214).
     */
    trace: AutomationStudioLlmEvidenceLoopTrace[];
    /** The judge's verdict, where a judge was given: always `yes`, about a test of this very Flow (its `flowSignature`). */
    judged?: Extract<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }>;
    /**
     * That verdict as the proposal records it (`./finishing-verdict.ts`): the
     * round, the judged and the standing Flow's signature digests and whether
     * they match, the judge's confidence, and any advice beside the yes as
     * unconfirmed. Present exactly when `judged` is (cause R2, run-musp8nz1).
     */
    finishing?: AutomationStudioFlowBootstrapFinishingVerdict;
  }
  /**
   * An ending this lifecycle does not reach past, as the round's loop reported
   * it: cancelled, a refused configuration, the evidence backstop. Never a
   * round that stopped short, which is always explored again, repaired or
   * ended with a stated reason.
   */
  | { kind: "ended"; loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>; accounting: AutomationStudioLlmEvidenceLoopAccounting; rounds: number; trace: AutomationStudioLlmEvidenceLoopTrace[] }
  /** Not doable, a budget ran out first, or the replies could not be read: the ending the person is told. */
  | {
    kind: "unfinished";
    ending: AutomationStudioFlowBootstrapBuildEnding;
    /**
     * Every round's record, which the failure's counts and steps are read
     * from: each round's trace in order, its decisions numbered across the
     * build, and what every round spent. The last round's exhaustion, where
     * it ran out of one. It used to be the last round's alone, so a build that
     * explored again after a stalled round published the second round's four
     * decisions beside the whole build's tokens, and the first round's eight
     * were gone (t214).
     */
    progress: AutomationStudioFlowBootstrapRoundProgress;
    lastIssueCodes: readonly string[];
    kept: AutomationStudioFlowBootstrapIncompleteDraftPointer | undefined;
    accounting: AutomationStudioLlmEvidenceLoopAccounting;
    rounds: number;
  };

/** Runs the build's rounds until a Flow is accepted, or the build ends with a stated reason. */
export async function runAutomationStudioFlowBootstrapBuildPhases(input: AutomationStudioFlowBootstrapBuildPhasesInput): Promise<AutomationStudioFlowBootstrapBuildPhasesOutcome> {
  const clock = input.now ?? Date.now;
  const startedAt = clock();
  const maxRounds = Math.min(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS, Math.max(1, input.maxRounds ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS));
  const spent = emptyAccounting();
  /** Every round's trace rows, numbered across the build. */
  const record: AutomationStudioLlmEvidenceLoopTrace[] = [];
  let repair: AutomationStudioFlowBootstrapRoundRequest["repair"];
  let previous: AutomationStudioFlowBootstrapJudgement | undefined;
  /** Rounds in a row that measurably did no better than the judged round before each (t195-w37): one more is opened after the first only when the judge named the fix. */
  let unprogressed = 0;
  /** The replay signature of the Flow this round starts from; absent when it starts from nothing. */
  let startSignature = input.seedSignature;
  /** What one more round needs of the purse; with a judge, its judging is kept back from every other call from here (t254). */
  const funding = automationStudioFlowBootstrapRoundFunding(input.purse, input.judge !== undefined);
  /** Why each round that reached phase 2 stopped, in order: what the ending records, so a debug can tell which bound ended which round (live run muqk713g). */
  const stops: NonNullable<AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"]> = [];
  /**
   * The last `no` a judge of this build gave a round's Flow -- a finished
   * round's, or a stopped round's put to the judge: the Flow signature of the
   * test it judged -- the verdict's own, else the round's Flow, which a `no` is
   * always about -- and its account. A round that stops on that very Flow is not
   * judged again.
   */
  let judgedNo: { flowSignature: string; judge: AutomationStudioFlowBootstrapJudgedWrong } | undefined;
  for (let round = 0; ; round += 1) {
    const left = round === 0 ? { budget: input.budget, maxIterations: input.maxIterations } : remaining(input, spent, clock() - startedAt);
    let outcome: AutomationStudioLlmEvidenceLoopResult | AutomationStudioFlowBootstrapUnfinishedStall;
    try {
      // The step log's round and phase for every call this round makes (`../../llm/step-log/`): a round with nothing to repair explores.
      const phase = round === 0 || !repair?.seed.length ? "explore" : "repair";
      outcome = await automationStudioLlmStepLogScope.run({ round, phase }, () => input.round({ round, ...left, ...(input.purse ? { purse: input.purse } : {}), ...(repair ? { repair } : {}), stalled: (progress) => new AutomationStudioFlowBootstrapUnfinishedStall(progress) }));
    } catch (error) {
      if (!(error instanceof AutomationStudioFlowBootstrapUnfinishedStall)) throw error;
      outcome = error;
    }
    const ending = automationStudioFlowBootstrapRoundEnding(outcome);
    // Every round publishes its rows: one that stopped short with the ending, the one that finished with the Flow.
    record.push(...numberedAcrossBuild(ending.kind === "finished" || ending.kind === "other" ? ending.loop.trace : ending.progress.trace, spent.iterations));
    // What the rounds before this one spent: without the build's purse a repair's loop holds only what they left, so its refusal's spend is this round's alone.
    const spentBefore = spent.estimatedCostUsd;
    addAccounting(spent, ending.kind === "finished" || ending.kind === "other" ? ending.loop.accounting : ending.progress.accounting);
    const rounds = round + 1;
    if (ending.kind === "other") return { kind: "ended", loop: ending.loop, accounting: spent, rounds, trace: [...record] };
    let phase2: Phase2;
    /** What judging the Flow cost, where the judging reserve stopped the round and its Flow was judged with it: what the cost ending says the reserve went on. */
    let judgedAtStopUsd: number | undefined;
    /** Whether the judging reserve stopped the round on the Flow a judge last said no to, so it was neither tested nor judged again. */
    let unchangedAtStop = false;
    if (ending.kind === "finished") {
      if (!input.judge) return { kind: "finished", loop: ending.loop, accounting: spent, rounds, trace: [...record] };
      // Phase 2 for a Flow the model said was ready: its test already ran in the loop; the judge reads what it did.
      input.announce?.({ phase: "verifying", label: "Judging the Flow", text: "The Flow was tested from its start. Judging what the test did against what you asked." });
      const verdict = await judgeAccounted(input, input.judge, { round, loop: ending.loop }, spent, clock() - startedAt);
      if (verdict === "cancelled") {
        return { kind: "ended", loop: { ok: false, code: "llm_evidence_loop.cancelled", trace: [...ending.loop.trace], steps: ending.loop.steps, accounting: { ...ending.loop.accounting } }, accounting: spent, rounds, trace: [...record] };
      }
      // Only a yes about a test of the Flow as it now stands finishes the build (user, 2026-10-02).
      const standing = automationStudioFlowDraftFlowSignature(ending.loop.steps);
      if (verdict.verdict === "yes" && verdict.flowSignature === standing) {
        return { kind: "finished", loop: ending.loop, accounting: spent, rounds, trace: [...record], judged: verdict, finishing: automationStudioFlowBootstrapFinishingVerdict({ verdict, round, judgedAt: "finished_round", steps: ending.loop.steps }) };
      }
      const judged = automationStudioFlowBootstrapJudgeFinished({ round, steps: ending.loop.steps, verdict: verdict.verdict === "yes" ? automationStudioFlowBootstrapYesNotAboutThisFlow(verdict) : verdict, checklist: input.checklist });
      const completionAttempts = ending.loop.trace.filter((row) => row.decision === "complete").length;
      phase2 = { stopped: "judged_wrong", ...judged, lastIssueCodes: [], completionAttempts, progress: { trace: ending.loop.trace, accounting: ending.loop.accounting } };
      if (verdict.verdict === "no" && judged.judgement.judge) judgedNo = { flowSignature: verdict.flowSignature ?? standing, judge: judged.judgement.judge };
    } else {
      const stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget" = ending.kind === "budget" ? "budget" : ending.stopped;
      const asked = input.callerEnding?.({ ...ending.progress, trace: [...record], accounting: { ...spent } });
      if (asked !== undefined) throw asked;
      // A round stopped because its next call would have eaten into the judging kept back: that reserve is spent judging the Flow as it stands (`./reserve-judging.ts`, t254 stage 2).
      const judge = input.judge;
      const stoppedAtReserve = ending.kind === "budget" && (ending.bound === "cost" || ending.bound === "calls") && input.purse !== undefined && judge !== undefined && ((ending.progress.exhaustion?.costRefusal?.keptBackUsd ?? 0) > 0 || (ending.progress.exhaustion?.callRefusal?.keptBackCalls ?? 0) > 0);
      const toTest = automationStudioFlowBootstrapRepairSeed(ending.steps);
      // The Flow a judge last said no to, unchanged (t254 stage 3): testing and judging it again would buy the same answer, so nothing is spent judging it.
      const unchangedSinceNo = judgedNo !== undefined && toTest.length > 0 && automationStudioFlowDraftFlowSignature(toTest) === judgedNo.flowSignature;
      unchangedAtStop = stoppedAtReserve && unchangedSinceNo;
      // Judging is a pair, and a yes finishes the build only once its second call confirms it: where the purse can no longer hold the whole pair, nothing is tested or judged for it (D3-5, run-mux6nxst-c9bca37c: one unconfirmed yes finished a build).
      const pairFits = input.purse?.judgingFits() ?? true;
      const atReserve = stoppedAtReserve && !unchangedAtStop && pairFits;
      // A round that stopped short of a completion is judged too, once its test runs clean, unless its Flow is that one (t195-w42, run-musp474o-e0ed7432).
      const shortJudged = ending.kind === "unfinished" && judge !== undefined && !unchangedSinceNo && pairFits;
      const boundSaid = ending.kind === "budget" && ending.bound === "calls" ? "model call allowance" : "spending limit";
      if (unchangedAtStop) {
        input.announce?.({ phase: "verifying", label: "Flow unchanged since judged", text: `The build reached its ${boundSaid} before the Flow was finished. The Flow is unchanged since the judge said it does not do what was asked, so what was kept back for judging is not spent judging it again.` });
      } else if (stoppedAtReserve && !pairFits) {
        input.announce?.({ phase: "verifying", label: "Too little left to judge", text: `The build reached its ${boundSaid} before the Flow was finished, with too little left to judge the Flow whole, so it is not tested or judged again.` });
      }
      // Said only when the test will run: a Flow with steps in it that carries what a replay needs, exactly as `automationStudioFlowBootstrapJudgeUnfinished` decides. An empty Flow has nothing to run, and one nothing can replay is not run; announcing a test then was followed by none (live run murwcmx2, UI-4).
      if ((ending.kind === "unfinished" || atReserve) && toTest.length && input.replayable(toTest)) {
        input.announce?.(atReserve
          ? { phase: "verifying", label: "Testing the Flow so far", text: `The build reached its ${boundSaid} before the Flow was finished. Running the Flow as far as it got from its start, and judging it with what was kept back for judging.` }
          : { phase: "verifying", label: "Testing the Flow so far", text: `The build stopped before the Flow was finished: ${automationStudioFlowBootstrapStopSaid(stopped, ending.lastIssueCodes)}. Running the Flow as far as it got from its start, to judge what it does and what is left.` });
      }
      // Phase 2: a round any other budget stopped is judged from the checklist alone; nothing more is run for a build that is ending.
      const judged = await automationStudioFlowBootstrapJudgeUnfinished({
        round, stopped, steps: ending.steps, lastIssueCodes: ending.lastIssueCodes,
        // The test's steps are logged as this round's test (`../../llm/step-log/`); a test the judge reads next says so.
        ...(ending.kind === "unfinished" || atReserve ? { test: (steps: AutomationStudioFlowDraftStep[]) => automationStudioLlmStepLogScope.run({ round, phase: "test" }, () => (atReserve || shortJudged ? input.test(steps, { judged: true }) : input.test(steps))) } : {}),
        replayable: input.replayable, checklist: input.checklist
      });
      const cancelled = (): AutomationStudioFlowBootstrapBuildPhasesOutcome => ({ kind: "ended", loop: { ok: false, code: "llm_evidence_loop.cancelled", trace: [...ending.progress.trace], steps: ending.steps, accounting: { ...ending.progress.accounting } }, accounting: spent, rounds, trace: [...record] });
      if (judged.kind === "cancelled") return cancelled();
      phase2 = { stopped, judgement: judged.judgement, seed: judged.seed, lastIssueCodes: ending.lastIssueCodes, completionAttempts: ending.completionAttempts, progress: ending.progress };
      // The ending says what that judge found of this same Flow.
      if (unchangedAtStop && judgedNo) phase2 = { ...phase2, judgement: { ...judged.judgement, judge: judgedNo.judge } };
      if ((atReserve || shortJudged) && judge) {
        const stoppedJudging = await automationStudioFlowBootstrapJudgeAtReserve({
          stopped: !atReserve ? "short" : ending.kind === "budget" && ending.bound === "calls" ? "calls" : "cost", judgement: judged.judgement, seed: judged.seed, progress: ending.progress, accept: input.acceptStopped,
          judge: (loop) => {
            if (!atReserve) input.announce?.({ phase: "verifying", label: "Judging the Flow", text: `${automationStudioFlowBootstrapTestReachSaid(judged.seed)} Judging what the test did against what you asked.` });
            return judgeAccounted(input, judge, { round, loop }, spent, clock() - startedAt);
          }
        });
        if (stoppedJudging.kind === "cancelled") return cancelled();
        if (stoppedJudging.kind === "finished") return { kind: "finished", loop: stoppedJudging.loop, accounting: spent, rounds, trace: [...record], judged: stoppedJudging.verdict, finishing: automationStudioFlowBootstrapFinishingVerdict({ verdict: stoppedJudging.verdict, round, judgedAt: atReserve ? "judging_reserve" : "stopped_short", steps: stoppedJudging.loop.steps }) };
        if (stoppedJudging.kind === "judged") {
          // A short round's judgement goes on to phase 3's rules as it stands; a reserve-stopped round's ends the build at its budget.
          phase2 = { ...phase2, judgement: stoppedJudging.judgement };
          if (atReserve) judgedAtStopUsd = stoppedJudging.judgingUsd;
          if (stoppedJudging.verdict.verdict === "no" && stoppedJudging.judgement.judge) judgedNo = { flowSignature: stoppedJudging.verdict.flowSignature ?? automationStudioFlowDraftFlowSignature(judged.seed), judge: stoppedJudging.judgement.judge };
        }
      }
    }
    const { stopped, judgement, seed } = phase2;
    stops.push({ round, stopped });
    /** The next round's worst case, where the purse could not fund it though it was not spent: what a cost ending says it needed. */
    let unfunded: AutomationStudioFlowBootstrapNextRoundHold | undefined;
    const end = async (kind: "not_doable" | AutomationStudioFlowBootstrapBudgetBound | { notFinished: AutomationStudioFlowBootstrapStoodStill } | { unreadable: AutomationStudioLlmEvidenceLoopUnreadable } | { providerUnavailable: AutomationStudioLlmEvidenceLoopProviderUnavailable }, noRoute?: AutomationStudioFlowBootstrapNoRouteLeft): Promise<AutomationStudioFlowBootstrapBuildPhasesOutcome> => {
      const kept = await input.keep(kind === "not_doable" || typeof kind === "object" ? (stopped === "budget" ? "budget" : stopped) : "budget", phase2.lastIssueCodes, seed, phase2.completionAttempts);
      const checklist = input.checklist(seed);
      const told = { judgement, checklist, rounds, decisions: spent.iterations, stops: [...stops] };
      return {
        kind: "unfinished",
        ending: kind === "not_doable"
          ? automationStudioFlowBootstrapNotDoable({ ...told, ...(noRoute ? { noRoute } : {}) })
          : typeof kind === "object" && "notFinished" in kind
            ? automationStudioFlowBootstrapNotFinished({ ...told, stoodStill: kind.notFinished, kept: kept !== undefined })
          : typeof kind === "object" && "providerUnavailable" in kind
            ? automationStudioFlowBootstrapProviderUnavailable({ ...told, providerUnavailable: kind.providerUnavailable, changes: record.filter((row) => row.decision === "tool_call" && row.effectApplied === true).length, kept: kept !== undefined })
          : typeof kind === "object"
            ? automationStudioFlowBootstrapRepliesUnreadable({ ...told, unreadable: kind.unreadable, kept: kept !== undefined })
            : automationStudioFlowBootstrapBudgetExhausted({ ...told, bound: kind, kept: kept !== undefined, sizes: { maxCostUsd: input.purse?.ceilingUsd ?? input.budget.maxCostUsd, maxDurationMs: input.budget.maxDurationMs, maxTotalTokens: input.budget.maxTotalTokens, declaredCalls: input.declaredCalls, maxRounds }, spending: kind === "cost" ? costSpending(phase2.progress.exhaustion?.costRefusal, input.purse, spentBefore, spent.estimatedCostUsd, unfunded, judgedAtStopUsd, unchangedAtStop) : undefined, lastRound: phase2.progress.trace }),
        progress: { trace: [...record], accounting: { ...spent }, ...(phase2.progress.exhaustion ? { exhaustion: phase2.progress.exhaustion } : {}) },
        lastIssueCodes: phase2.lastIssueCodes,
        kept,
        accounting: spent,
        rounds
      };
    };
    /** The budget with too little left to open another round, where one has; it notes what the round needed when the purse could not fund it. */
    const exhaustedForNextRound = (): AutomationStudioFlowBootstrapBudgetBound | undefined => {
      const next = funding.nextRound();
      const exhausted = exhaustedBound(input, spent, clock() - startedAt, next?.usd);
      if (exhausted === "cost" && next && input.purse && input.purse.leftUsd() > PURSE_EMPTY_USD) unfunded = next;
      // The call allowance must hold the round's first decision and its judging pair, or the round is not opened (`./round-funding.ts`, D3-5).
      return exhausted ?? (funding.callsFit() ? undefined : "calls");
    };
    if (ending.kind === "budget") return await end(ending.bound);
    // Replies that kept arriving unreadable, each asked again: said as exactly that, with how many tries.
    if (ending.kind === "unreadable") return await end({ unreadable: ending.unreadable });
    // A provider that stopped answering ends the build now: never another round of waits (run-muq05kas-058193f0).
    if (ending.kind === "provider_unavailable") return await end({ providerUnavailable: ending.providerUnavailable });
    const todo = judgement.todo.length;
    const resume = (): AutomationStudioLlmEvidenceLoopResume => ({ revision: round + 1, stopped, outstandingIssueCodes: [...judgement.lastIssueCodes, ...judgement.testIssueCodes], judgement: automationStudioFlowBootstrapJudgementValue(judgement) });
    // Nothing in the Flow: never an ending while budget remains. The model is told so, with the checklist all to do, and explores on live.
    if (!judgement.stepsInFlow) {
      if (rounds >= maxRounds) return await end("rounds");
      const exhausted = exhaustedForNextRound();
      if (exhausted) return await end(exhausted);
      const allTodo = todo === 1 ? ", and the one thing you asked is still to do" : todo ? `, and all ${todo} of the things you asked are still to do` : "";
      input.announce?.({ phase: "exploring", label: "Exploring again", text: `Nothing is in the Flow yet${allTodo}. Exploring on from the page as it stands.` });
      repair = { seed: [], resume: resume() };
      previous = undefined;
      unprogressed = 0;
      startSignature = undefined;
      continue;
    }
    // A Flow holding steps that never ran in this build was not run from its start: no measurement, so neither "not doable" nor a stall is concluded from it (t194-w70, murwcmx2 C-F).
    const unmeasured = automationStudioFlowBootstrapJudgementUnmeasured(judgement);
    const moved = previous ? automationStudioFlowBootstrapJudgementProgress(previous, judgement) : undefined;
    if (!unmeasured) {
      // The one no-way condition: the judge says what was asked can no longer be had, about a Flow run from its start (t195-w37).
      if (judgement.judge?.verdict === "no" && judgement.judge.stillAchievable === "no") return await end("not_doable", { kind: "judged_unachievable" });
      // A round that ended on refused repeats and handed back the Flow it started from: a second round would repeat it exactly (run 38, C8). Not finished, never "not doable".
      if (stopped === "repeat_without_progress" && startSignature !== undefined && judgement.flowSignature === startSignature) return await end({ notFinished: { kind: "repeated_unchanged" } });
      // Phase 3, or a stop: a round that measurably did no better than the judged Flow before it.
      if (previous && moved) {
        if (moved.length) unprogressed = 0;
        else {
          unprogressed += 1;
          // One more round after a judge who said no, still achievable or unsure, and named the fix; two in a row end it (run-murwcaj0-40e56557).
          if (unprogressed > 1 || !judgedFixNamed(judgement)) return await end({ notFinished: { kind: "no_progress", before: previous, rounds: unprogressed } });
        }
      }
    }
    // Whether the round before this one also held steps never run, and this one ran none of them: what the announcement says.
    const ranNoneAgain = unmeasured && previous !== undefined && automationStudioFlowBootstrapJudgementUnmeasured(previous) && !moved?.includes("fewer_steps_not_run");
    previous = judgement;
    if (rounds >= maxRounds) return await end("rounds");
    const exhausted = exhaustedForNextRound();
    if (exhausted) return await end(exhausted);
    const notRunSteps = judgement.judge?.untestedCarried?.length ? [] : judgement.notRunInThisBuild ?? [];
    input.announce?.({ phase: "repairing", label: "Repairing the Flow", text: notRunSteps.length ? automationStudioFlowBootstrapRepairingNotRunSaid(notRunSteps, ranNoneAgain) : judgement.judge ? automationStudioFlowBootstrapRepairingJudgedSaid(judgement.judge) : todo ? `Repairing the Flow live: ${todo} of the things you asked ${todo === 1 ? "is" : "are"} still to do.` : "Repairing the Flow live on what did not work when it was run." });
    repair = {
      seed,
      resume: resume()
    };
    startSignature = automationStudioFlowDraftReplaySignature(seed);
  }
}

/** Whether the judge said no, with what was asked still achievable or unsure, and named what to change: what buys one more round after one without measured progress. */
function judgedFixNamed(judgement: AutomationStudioFlowBootstrapJudgement): boolean {
  const judge = judgement.judge;
  return judge?.verdict === "no" && judge.stillAchievable !== "no" && Boolean(judge.advice?.trim());
}

/** What a round left for phase 2 and phase 3: the judgement of its Flow, and what an ending is written from. */
type Phase2 = {
  stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget";
  judgement: AutomationStudioFlowBootstrapJudgement;
  seed: AutomationStudioFlowDraftStep[];
  lastIssueCodes: readonly string[];
  completionAttempts: number;
  progress: AutomationStudioFlowBootstrapRoundProgress;
};

/** Whether a judge's failure is the build being cancelled. */
function cancellation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/**
 * Asks the build's judge about `request.loop` within what the build has left
 * -- with a purse, what it has left, earlier builds' spend and calls in flight
 * taken out -- and adds what judging spent to `spent`: its tokens and cost from
 * the verdict, and the breaches and overshoot the purse recorded across its
 * calls (t254 stage 2), so the build's figures are what the purse charged.
 * `cancelled` where the judge was stopped with the build.
 */
async function judgeAccounted(
  input: AutomationStudioFlowBootstrapBuildPhasesInput,
  judge: NonNullable<AutomationStudioFlowBootstrapBuildPhasesInput["judge"]>,
  request: { round: number; loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }> },
  spent: AutomationStudioLlmEvidenceLoopAccounting,
  elapsedMs: number
): Promise<AutomationStudioFlowBootstrapTestVerdict | "cancelled"> {
  const { budget } = remaining(input, spent, elapsedMs);
  const breachesBefore = input.purse?.breaches ?? 0;
  const overshootBefore = input.purse?.overshootUsd ?? 0;
  let verdict: AutomationStudioFlowBootstrapTestVerdict;
  try {
    verdict = await judge({ ...request, budget: input.purse ? { ...budget, maxCostUsd: input.purse.leftUsd() } : budget });
  } catch (error) {
    if (!cancellation(error)) throw error;
    return "cancelled";
  }
  // Nothing else draws on the purse while the judge runs: rounds and their judging are one after another.
  const breaches = (input.purse?.breaches ?? 0) - breachesBefore;
  addAccounting(spent, { ...judgeAccounting(verdict.spent), ...(breaches > 0 ? { budgetBreaches: breaches, budgetOvershootUsd: (input.purse?.overshootUsd ?? 0) - overshootBefore } : {}) });
  return verdict;
}

/** The judge's spend as a round's accounting: tokens and cost, and no decision, tool call or evidence. */
function judgeAccounting(spend: AutomationStudioFlowBootstrapJudgeSpend): AutomationStudioLlmEvidenceLoopAccounting {
  return { ...emptyAccounting(), inputTokens: spend.inputTokens, outputTokens: spend.outputTokens, totalTokens: spend.totalTokens, estimatedCostUsd: spend.estimatedCostUsd };
}

/**
 * What a cost ending says was spent (t194-w47: a cost ending without figures
 * is never said). With the build's purse the figures are its own, and already
 * the Flow creation's: the refusal that ended the round as it stands -- what
 * was spent, earlier builds' spend included and named, what was held, and the
 * refused call's worst case -- or, where nothing was refused (a round the purse
 * could not fund), what the purse has spent and holds, and what that round
 * needed where the purse was not spent outright, and whether the judging kept
 * back went unspent on a Flow a judge had said no to, unchanged. Without
 * one, a round's loop was given what the rounds before left of the ceiling, so
 * what the build had spent is theirs plus what that loop counted, and every
 * other cost ending says the whole build's spend.
 */
function costSpending(refusal: AutomationStudioLlmEvidenceLoopExhaustion["costRefusal"], purse: AutomationStudioLlmBuildPurse | undefined, spentBefore: number, spentInAll: number, unfunded: AutomationStudioFlowBootstrapNextRoundHold | undefined, judgedAtStopUsd: number | undefined, unchangedAtStop: boolean): AutomationStudioFlowBootstrapCostSpending {
  const projected = refusal?.projectedCostUsd !== undefined ? { projectedCostUsd: refusal.projectedCostUsd } : {};
  // The judging reserve was then spent judging the Flow as it stood: what the purse holds now and what that judging cost, rather than the reserve the refusal named.
  if (purse && judgedAtStopUsd !== undefined) {
    return { spentUsd: purse.spentUsd(), pendingUsd: purse.pendingUsd(), ...projected, ...(purse.carriedUsd > 0 ? { carriedUsd: purse.carriedUsd } : {}), ceilingUsd: purse.ceilingUsd, judgedUsd: judgedAtStopUsd };
  }
  if (purse) {
    const carriedUsd = refusal ? refusal.carriedUsd ?? 0 : purse.carriedUsd;
    return {
      ...(refusal ? { spentUsd: refusal.spentUsd, pendingUsd: refusal.pendingUsd } : { spentUsd: purse.spentUsd(), pendingUsd: purse.pendingUsd() }),
      ...projected,
      ...(carriedUsd > 0 ? { carriedUsd } : {}),
      ...(refusal?.keptBackUsd ? { keptBackUsd: refusal.keptBackUsd } : {}),
      // The reserve the refusal left unspent, because the Flow was unchanged since a judge said no to it (t254 stage 3).
      ...(unchangedAtStop ? { unchangedSinceJudgedNo: true as const } : {}),
      ceilingUsd: refusal?.ceilingUsd ?? purse.ceilingUsd,
      ...(!refusal && unfunded ? { nextRound: unfunded } : {})
    };
  }
  if (!refusal) return { spentUsd: spentInAll, pendingUsd: 0 };
  return { spentUsd: spentBefore + refusal.spentUsd, pendingUsd: refusal.pendingUsd, ...projected };
}

/**
 * What the rounds so far have left of the build's budget, for the next one.
 * With a purse the cost stays whole: the purse holds what is left of it, and a
 * share refilled from the rounds' accounting would be a second count.
 */
function remaining(input: AutomationStudioFlowBootstrapBuildPhasesInput, spent: AutomationStudioLlmEvidenceLoopAccounting, elapsedMs: number): { budget: AutomationStudioLlmEvidenceLoopBudget; maxIterations: number } {
  const budget: AutomationStudioLlmEvidenceLoopBudget = {
    ...input.budget,
    ...(input.budget.maxCostUsd !== undefined && !input.purse ? { maxCostUsd: Math.max(0, input.budget.maxCostUsd - spent.estimatedCostUsd) } : {}),
    ...(input.budget.maxTotalTokens !== undefined ? { maxTotalTokens: Math.max(0, input.budget.maxTotalTokens - spent.totalTokens) } : {}),
    ...(input.budget.maxDurationMs !== undefined ? { maxDurationMs: Math.max(0, input.budget.maxDurationMs - elapsedMs) } : {})
  };
  const callsLeft = input.declaredCalls === undefined ? input.maxIterations : Math.max(0, input.declaredCalls - spent.iterations);
  return { budget, maxIterations: Math.min(input.maxIterations, callsLeft) };
}

/**
 * The budget with too little left to start another round with, or nothing when
 * there is enough of each. With a purse, enough is `needUsd` -- the next
 * round's judging pair and the least of its first decision
 * (`./round-funding.ts`) -- where the purse has priced a call, and anything at
 * all where it has not.
 */
function exhaustedBound(input: AutomationStudioFlowBootstrapBuildPhasesInput, spent: AutomationStudioLlmEvidenceLoopAccounting, elapsedMs: number, needUsd: number | undefined): AutomationStudioFlowBootstrapBudgetBound | undefined {
  const { budget, maxIterations } = remaining(input, spent, elapsedMs);
  if (input.purse) {
    const left = input.purse.leftUsd();
    // A purse's spend is summed in floating point: a ceiling spent to the cent can leave 1e-17 of it, which no call fits.
    if (left <= PURSE_EMPTY_USD || (needUsd !== undefined && left + PURSE_EMPTY_USD < needUsd)) return "cost";
  } else if (budget.maxCostUsd !== undefined && budget.maxCostUsd <= 0) return "cost";
  if (budget.maxTotalTokens !== undefined && budget.maxTotalTokens < (budget.maxTokensPerDecision ?? 1)) return "tokens";
  if (budget.maxDurationMs !== undefined && budget.maxDurationMs < AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MIN_REPAIR_MS) return "duration";
  if (maxIterations < 1) return "calls";
  return undefined;
}

/**
 * A round's trace rows with each decision numbered across the build: a
 * round's own numbering starts at 1 again, so a repair's first decision would
 * otherwise read as the exploration's first. The rounds before had made
 * `before` decisions. `0`, the observation no decision paid for, stays `0`.
 */
function numberedAcrossBuild(trace: readonly AutomationStudioLlmEvidenceLoopTrace[], before: number): AutomationStudioLlmEvidenceLoopTrace[] {
  return trace.map((row) => (row.iteration > 0 && before > 0 ? { ...row, iteration: row.iteration + before } : row));
}

function emptyAccounting(): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

function addAccounting(into: AutomationStudioLlmEvidenceLoopAccounting, from: Readonly<AutomationStudioLlmEvidenceLoopAccounting>): void {
  into.iterations += from.iterations;
  into.toolCalls += from.toolCalls;
  into.evidenceBytes += from.evidenceBytes;
  into.inputTokens += from.inputTokens;
  into.cacheHitInputTokens = (into.cacheHitInputTokens ?? 0) + (from.cacheHitInputTokens ?? 0);
  into.outputTokens += from.outputTokens;
  into.totalTokens += from.totalTokens;
  into.estimatedCostUsd += from.estimatedCostUsd;
  // A call that cost more than the purse held it at is a breach of the build's ceiling, whichever round made it; absent means none.
  if (from.budgetBreaches) into.budgetBreaches = (into.budgetBreaches ?? 0) + from.budgetBreaches;
  if (from.budgetOvershootUsd) into.budgetOvershootUsd = (into.budgetOvershootUsd ?? 0) + from.budgetOvershootUsd;
}
