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
// calls, $0.06 of $0.25 and 398 s of 540 s still unused.
//
// **What happens now.** A round that stops short with steps in its Flow goes
// to phase 2 with what it has: the Flow so far is tested from its start and
// judged against the checklist (`./judgement.ts`). Then phase 3: a repair round, live, seeded with
// that Flow and told the judgement, working on what is missing or failing with
// the same checklist. When the model says the Flow is ready the loop tests it
// as it always does; a Flow it accepts is the build's result. A repair that
// stops short is judged again, and another repair follows while each gets
// further than the judgement before it. One that gets no further is the
// evidence that no route is left: the build ends "not doable", with the acts
// that cannot be done, why, and what was tried (`./not-doable.ts`).
//
// **A round that stops with nothing in its Flow never ends the build while
// budget remains (supervisor, t208).** It was the main case -- 57 of 117 live
// builds ended with no Flow (audit A1) -- and it used to end as a bare
// `evidence_unusable_decision` or `evidence_iteration_limit`. Now the model is
// told plainly that nothing is in the Flow yet, with the checklist all to do,
// and keeps exploring live from the page as it stands, round after round,
// until a Flow is accepted or a budget runs out; the budget ending then says
// what was tried, how far it got and what blocked it. "Not doable" is never
// reached from an empty Flow: it needs the evidence of a repair that got no
// further than a judged Flow.
//
// **A Flow the model says is ready is judged (t195).** With a `judge`, what
// the loop's test of it did is judged against the instruction: `yes` is the
// result; `no` is repaired as a round that stopped short is, "not doable" only
// when a repair hands back the same Flow; an unsure verdict is the result,
// unverified, unless steps carried from an earlier Flow were not run in the
// test (run 41, `run-muq70foz-74caa189`), which is repaired. The judge's spend
// counts against the build's run cost ceiling.
//
// **Unreadable replies end the build only as that (t211).** Each reply the
// loop could not read is asked again; an unbroken run of them ends the round
// as `unreadable`, and the build with a message saying so and how many tries
// it took (`./replies-unreadable.ts`) -- never "not doable", and never a bare
// code.
//
// **A budget is never "not doable".** A round stopped by the spend ceiling,
// the token budget or the deadline -- or a repair that has none of them left to
// start with -- ends the build as exactly that (`./budget-exhausted.ts`). The
// $0.25 per-build ceiling holds across every round: each repair is given only
// what the rounds before it left of the build's cost, tokens and time, and of
// a call count the Flow's settings declared. The decision backstop is not such
// a budget: each round meets it on its own.
//
// Everything that decides a round belongs to the caller (`round`, `test`):
// this module never calls a provider or runs a tool itself, and every ending
// the caller's loop raises that is not a stall -- a permission ask, a person
// needed, a provider failure -- passes through untouched.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopBudget, AutomationStudioLlmEvidenceLoopExhaustion, AutomationStudioLlmEvidenceLoopProviderUnavailable, AutomationStudioLlmEvidenceLoopResult, AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceLoopUnreadable } from "../../llm/index.ts";
import type { AutomationStudioLlmEvidenceLoopResume } from "../../llm/evidence-loop/index.ts";
import type { AutomationStudioFlowBootstrapBudgetBound, AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioFlowBootstrapIncompleteDraftPointer } from "../incomplete-draft/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS } from "../../loop-limits/index.ts";
import { automationStudioLlmStepLogScope } from "../../llm/step-log/index.ts";
import { automationStudioFlowBootstrapBudgetExhausted } from "./budget-exhausted.ts";
import type {
  AutomationStudioFlowBootstrapJudgeSpend,
  AutomationStudioFlowBootstrapJudgement,
  AutomationStudioFlowBootstrapRoundProgress,
  AutomationStudioFlowBootstrapTestVerdict,
  AutomationStudioFlowBootstrapUnfinishedStop
} from "./contracts.ts";
import {
  automationStudioFlowBootstrapJudgeFinished,
  automationStudioFlowBootstrapJudgeUnfinished,
  automationStudioFlowBootstrapJudgementAdvanced,
  automationStudioFlowBootstrapJudgementValue,
  automationStudioFlowBootstrapRepairSeed,
  type AutomationStudioFlowBootstrapUnfinishedTest
} from "./judgement.ts";
import { automationStudioFlowBootstrapNotDoable } from "./not-doable.ts";
import { automationStudioFlowBootstrapRepliesUnreadable } from "./replies-unreadable.ts";
import { automationStudioFlowBootstrapProviderUnavailable } from "./provider-unavailable.ts";
import { automationStudioFlowBootstrapRepairingJudgedSaid, automationStudioFlowBootstrapStopSaid } from "./not-done.ts";
import { automationStudioFlowBootstrapRoundEnding } from "./round-ending.ts";
import { AutomationStudioFlowBootstrapUnfinishedStall } from "./unfinished-stall.ts";

/** Repairs one build may make after its exploration, while each gets further. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_REPAIR_ROUNDS = 2;

/** The least time worth starting a repair with: a look, a few decisions and the test. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MIN_REPAIR_MS = 30_000;

/** What one live round is given. */
export type AutomationStudioFlowBootstrapRoundRequest = {
  /** 0 for the exploration, then each repair. */
  round: number;
  /** What the build has left: the whole budget for the exploration, what the rounds before left for a repair. */
  budget: AutomationStudioLlmEvidenceLoopBudget;
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
  /** Tell the person the build moved to a phase: the chat's row for it. */
  announce?(event: { phase: "exploring" | "verifying" | "repairing"; label: string; text: string }): void;
  maxRepairRounds?: number;
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
    /** The judge's verdict, where a judge was given: `yes`, or an unsure one, which marks the Flow unverified. */
    judged?: AutomationStudioFlowBootstrapTestVerdict;
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
  const maxRepairRounds = input.maxRepairRounds ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_REPAIR_ROUNDS;
  const maxRounds = Math.min(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS, Math.max(1, input.maxRounds ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS));
  const spent = emptyAccounting();
  /** Every round's trace rows, numbered across the build. */
  const record: AutomationStudioLlmEvidenceLoopTrace[] = [];
  let repairs = 0;
  let repair: AutomationStudioFlowBootstrapRoundRequest["repair"];
  let previous: AutomationStudioFlowBootstrapJudgement | undefined;
  for (let round = 0; ; round += 1) {
    const left = round === 0 ? { budget: input.budget, maxIterations: input.maxIterations } : remaining(input, spent, clock() - startedAt);
    let outcome: AutomationStudioLlmEvidenceLoopResult | AutomationStudioFlowBootstrapUnfinishedStall;
    try {
      // The step log's round and phase for every call this round makes (`../../llm/step-log/`): a round with nothing to repair explores.
      const phase = round === 0 || !repair?.seed.length ? "explore" : "repair";
      outcome = await automationStudioLlmStepLogScope.run({ round, phase }, () => input.round({ round, ...left, ...(repair ? { repair } : {}), stalled: (progress) => new AutomationStudioFlowBootstrapUnfinishedStall(progress) }));
    } catch (error) {
      if (!(error instanceof AutomationStudioFlowBootstrapUnfinishedStall)) throw error;
      outcome = error;
    }
    const ending = automationStudioFlowBootstrapRoundEnding(outcome);
    // Every round publishes its rows: one that stopped short with the ending, the one that finished with the Flow.
    record.push(...numberedAcrossBuild(ending.kind === "finished" || ending.kind === "other" ? ending.loop.trace : ending.progress.trace, spent.iterations));
    // What the rounds before this one spent: a repair's purse holds only what they left, so its refusal's spend is this round's alone.
    const spentBefore = spent.estimatedCostUsd;
    addAccounting(spent, ending.kind === "finished" || ending.kind === "other" ? ending.loop.accounting : ending.progress.accounting);
    const rounds = round + 1;
    if (ending.kind === "other") return { kind: "ended", loop: ending.loop, accounting: spent, rounds, trace: [...record] };
    let phase2: Phase2;
    if (ending.kind === "finished") {
      if (!input.judge) return { kind: "finished", loop: ending.loop, accounting: spent, rounds, trace: [...record] };
      // Phase 2 for a Flow the model said was ready: its test already ran in the loop; the judge reads what it did.
      input.announce?.({ phase: "verifying", label: "Judging the Flow", text: "The Flow was tested from its start. Judging what the test did against what you asked." });
      let verdict: AutomationStudioFlowBootstrapTestVerdict;
      try {
        verdict = await input.judge({ round, loop: ending.loop, budget: remaining(input, spent, clock() - startedAt).budget });
      } catch (error) {
        if (!cancellation(error)) throw error;
        return { kind: "ended", loop: { ok: false, code: "llm_evidence_loop.cancelled", trace: [...ending.loop.trace], steps: ending.loop.steps, accounting: { ...ending.loop.accounting } }, accounting: spent, rounds, trace: [...record] };
      }
      addAccounting(spent, judgeAccounting(verdict.spent));
      if (verdict.verdict === "yes" || (verdict.verdict !== "no" && !verdict.untestedCarried?.length)) {
        return { kind: "finished", loop: ending.loop, accounting: spent, rounds, trace: [...record], judged: verdict };
      }
      const judged = automationStudioFlowBootstrapJudgeFinished({ round, steps: ending.loop.steps, verdict, checklist: input.checklist });
      const completionAttempts = ending.loop.trace.filter((row) => row.decision === "complete").length;
      phase2 = { stopped: "judged_wrong", ...judged, lastIssueCodes: [], completionAttempts, progress: { trace: ending.loop.trace, accounting: ending.loop.accounting } };
    } else {
      const stopped: AutomationStudioFlowBootstrapUnfinishedStop | "budget" = ending.kind === "budget" ? "budget" : ending.stopped;
      const asked = input.callerEnding?.({ ...ending.progress, trace: [...record], accounting: { ...spent } });
      if (asked !== undefined) throw asked;
      // Only a Flow with steps in it is tested: an empty one has nothing to run.
      if (ending.kind === "unfinished" && automationStudioFlowBootstrapRepairSeed(ending.steps).length) {
        input.announce?.({ phase: "verifying", label: "Testing the Flow so far", text: `The build stopped before the Flow was finished: ${automationStudioFlowBootstrapStopSaid(stopped)}. Running the Flow as far as it got from its start, to judge what it does and what is left.` });
      }
      // Phase 2: a round a budget stopped is judged from the checklist alone; nothing more is run for a build that is ending.
      const judged = await automationStudioFlowBootstrapJudgeUnfinished({
        round, stopped, steps: ending.steps, lastIssueCodes: ending.lastIssueCodes,
        // The test's steps are logged as this round's test (`../../llm/step-log/`).
        ...(ending.kind === "unfinished" ? { test: (steps: AutomationStudioFlowDraftStep[]) => automationStudioLlmStepLogScope.run({ round, phase: "test" }, () => input.test(steps)) } : {}),
        replayable: input.replayable, checklist: input.checklist
      });
      if (judged.kind === "cancelled") {
        return { kind: "ended", loop: { ok: false, code: "llm_evidence_loop.cancelled", trace: [...ending.progress.trace], steps: ending.steps, accounting: { ...ending.progress.accounting } }, accounting: spent, rounds, trace: [...record] };
      }
      phase2 = { stopped, judgement: judged.judgement, seed: judged.seed, lastIssueCodes: ending.lastIssueCodes, completionAttempts: ending.completionAttempts, progress: ending.progress };
    }
    const { stopped, judgement, seed } = phase2;
    const end = async (kind: "not_doable" | AutomationStudioFlowBootstrapBudgetBound | { unreadable: AutomationStudioLlmEvidenceLoopUnreadable } | { providerUnavailable: AutomationStudioLlmEvidenceLoopProviderUnavailable }): Promise<AutomationStudioFlowBootstrapBuildPhasesOutcome> => {
      const kept = await input.keep(kind === "not_doable" || typeof kind === "object" ? (stopped === "budget" ? "budget" : stopped) : "budget", phase2.lastIssueCodes, seed, phase2.completionAttempts);
      const checklist = input.checklist(seed);
      const told = { judgement, checklist, rounds, decisions: spent.iterations };
      return {
        kind: "unfinished",
        ending: kind === "not_doable"
          ? automationStudioFlowBootstrapNotDoable(told)
          : typeof kind === "object" && "providerUnavailable" in kind
            ? automationStudioFlowBootstrapProviderUnavailable({ ...told, providerUnavailable: kind.providerUnavailable, changes: record.filter((row) => row.decision === "tool_call" && row.effectApplied === true).length, kept: kept !== undefined })
          : typeof kind === "object"
            ? automationStudioFlowBootstrapRepliesUnreadable({ ...told, unreadable: kind.unreadable, kept: kept !== undefined })
            : automationStudioFlowBootstrapBudgetExhausted({ ...told, bound: kind, kept: kept !== undefined, sizes: { maxCostUsd: input.budget.maxCostUsd, maxDurationMs: input.budget.maxDurationMs, maxTotalTokens: input.budget.maxTotalTokens, declaredCalls: input.declaredCalls, maxRepairRounds, maxRounds }, spending: kind === "cost" ? costSpending(phase2.progress.exhaustion?.costRefusal, spentBefore, spent.estimatedCostUsd) : undefined }),
        progress: { trace: [...record], accounting: { ...spent }, ...(phase2.progress.exhaustion ? { exhaustion: phase2.progress.exhaustion } : {}) },
        lastIssueCodes: phase2.lastIssueCodes,
        kept,
        accounting: spent,
        rounds
      };
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
      const exhausted = exhaustedBound(input, spent, clock() - startedAt);
      if (exhausted) return await end(exhausted);
      input.announce?.({ phase: "exploring", label: "Exploring again", text: `Nothing is in the Flow yet${todo ? `, and all ${todo} of the things you asked are still to do` : ""}. Exploring on from the page as it stands.` });
      repair = { seed: [], resume: resume() };
      previous = undefined;
      continue;
    }
    // Phase 3, or the evidence that no route is left: a repair that got no further than the judged Flow before it.
    if (previous && !automationStudioFlowBootstrapJudgementAdvanced(previous, judgement)) return await end("not_doable");
    previous = judgement;
    if (repairs >= maxRepairRounds) return await end("repair_rounds");
    if (rounds >= maxRounds) return await end("rounds");
    const exhausted = exhaustedBound(input, spent, clock() - startedAt);
    if (exhausted) return await end(exhausted);
    repairs += 1;
    input.announce?.({ phase: "repairing", label: "Repairing the Flow", text: judgement.judge ? automationStudioFlowBootstrapRepairingJudgedSaid(judgement.judge) : todo ? `Repairing the Flow live: ${todo} of the things you asked ${todo === 1 ? "is" : "are"} still to do.` : "Repairing the Flow live on what did not work when it was run." });
    repair = {
      seed,
      resume: resume()
    };
  }
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

/** The judge's spend as a round's accounting: tokens and cost, and no decision, tool call or evidence. */
function judgeAccounting(spend: AutomationStudioFlowBootstrapJudgeSpend): AutomationStudioLlmEvidenceLoopAccounting {
  return { ...emptyAccounting(), inputTokens: spend.inputTokens, outputTokens: spend.outputTokens, totalTokens: spend.totalTokens, estimatedCostUsd: spend.estimatedCostUsd };
}

/**
 * What a cost ending says the build spent, in the build's own figures. Where
 * the round's cost budget declined a decision (`costRefusal`), the round's
 * purse was given what the rounds before left of the ceiling, so what the
 * build had spent is theirs plus what this round's purse counted, and the
 * declined call's worst case goes with it -- "at least" where the loop's count
 * declined it before the purse priced it. Every other cost ending -- a repair
 * with nothing left to start with -- says the whole build's spend (t194-w47:
 * a cost ending without figures is never said).
 */
function costSpending(refusal: AutomationStudioLlmEvidenceLoopExhaustion["costRefusal"], spentBefore: number, spentInAll: number): { spentUsd: number; pendingUsd: number; projectedCostUsd?: number; projectedAtLeast?: boolean } {
  if (!refusal) return { spentUsd: spentInAll, pendingUsd: 0 };
  return {
    spentUsd: spentBefore + refusal.spentUsd,
    pendingUsd: refusal.pendingUsd,
    ...(refusal.projectedCostUsd !== undefined ? { projectedCostUsd: refusal.projectedCostUsd, ...(refusal.declinedBy === "loop_budget" ? { projectedAtLeast: true } : {}) } : {})
  };
}

/** What the rounds so far have left of the build's budget, for the next one. */
function remaining(input: AutomationStudioFlowBootstrapBuildPhasesInput, spent: AutomationStudioLlmEvidenceLoopAccounting, elapsedMs: number): { budget: AutomationStudioLlmEvidenceLoopBudget; maxIterations: number } {
  const budget: AutomationStudioLlmEvidenceLoopBudget = {
    ...input.budget,
    ...(input.budget.maxCostUsd !== undefined ? { maxCostUsd: Math.max(0, input.budget.maxCostUsd - spent.estimatedCostUsd) } : {}),
    ...(input.budget.maxTotalTokens !== undefined ? { maxTotalTokens: Math.max(0, input.budget.maxTotalTokens - spent.totalTokens) } : {}),
    ...(input.budget.maxDurationMs !== undefined ? { maxDurationMs: Math.max(0, input.budget.maxDurationMs - elapsedMs) } : {})
  };
  const callsLeft = input.declaredCalls === undefined ? input.maxIterations : Math.max(0, input.declaredCalls - spent.iterations);
  return { budget, maxIterations: Math.min(input.maxIterations, callsLeft) };
}

/** The budget with nothing left to start a repair with, or nothing when there is enough of each. */
function exhaustedBound(input: AutomationStudioFlowBootstrapBuildPhasesInput, spent: AutomationStudioLlmEvidenceLoopAccounting, elapsedMs: number): AutomationStudioFlowBootstrapBudgetBound | undefined {
  const { budget, maxIterations } = remaining(input, spent, elapsedMs);
  if (budget.maxCostUsd !== undefined && budget.maxCostUsd <= 0) return "cost";
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
}
