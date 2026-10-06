// A budget ran out before the Flow was finished: reported as exactly that.
//
// The user's rule (2026-09-30): a budget or cost ceiling that is hit is said
// as the budget it is, never dressed up as "not doable" -- a build that ran
// out of money had a route it did not get to finish. So the message names the
// budget and its size, what of the request the Flow already does, what was
// tried and what blocked it, and whether the steps found so far were kept for the next
// build to carry on from. It is also how a build that authored nothing ends
// (supervisor, t208): never as a bare code, always with this message. A cost
// ending says the figures that stopped it (F41); where one purse holds the
// Flow's whole creation (t234), also what earlier builds of the Flow spent of
// them and what of the Flow's ceiling building again has left. What was kept
// is said as a draft (`./kept-said.ts`; t195-w37, live run
// `run-murz83zy-5030820f`, whose chat also said the Flow was left empty).
// What was tried is said as every ending says it, with no count of decisions
// or rounds (`automationStudioFlowBootstrapWorkedLiveSaid`, t195-w48); the
// counts stay in `tried`. The message is fitted, never cut inside a sentence
// (`./ending-fit.ts`; t193 round 1003): what was tried and what was kept close
// it, always whole.
import {
  type AutomationStudioFlowBootstrapBudgetBound,
  type AutomationStudioFlowBootstrapBuildEnding
} from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "./contracts.ts";
import {
  automationStudioFlowBootstrapBlockedSaid,
  automationStudioFlowBootstrapNotDone,
  automationStudioFlowBootstrapProgressAndTestSaid,
  automationStudioFlowBootstrapStopSaid,
  automationStudioFlowBootstrapUnsettledForBuild,
  automationStudioFlowBootstrapWorkedLiveSaid
} from "./not-done.ts";
import { automationStudioFlowBootstrapEndingFitted } from "./ending-fit.ts";
import { automationStudioFlowBootstrapJudgeWordsSaid } from "./judge-words.ts";
import { automationStudioFlowBootstrapKeptSaid } from "./kept-said.ts";
import { automationStudioFlowBootstrapTried } from "./tried.ts";

/** The size of each budget, as the person is told it. */
export type AutomationStudioFlowBootstrapBudgetSizes = {
  maxCostUsd?: number | undefined;
  maxDurationMs?: number | undefined;
  maxTotalTokens?: number | undefined;
  declaredCalls?: number | undefined;
  maxRounds?: number | undefined;
};

/**
 * What one more round needs at least under the purse (t240, t254;
 * `./round-funding.ts`): where `judged`, the judging of its Flow -- two judge
 * calls, each at its capped hold (`judgingUsd`) -- and the least its first
 * decision can be held at, its reply reserve alone (`decisionUsd`). `usd` is
 * their sum. The first decision itself is priced from its own request when it
 * is sent. A round is not opened that the purse cannot fund for this.
 */
export type AutomationStudioFlowBootstrapNextRoundHold = { usd: number; judged: boolean; judgingUsd?: number | undefined; decisionUsd?: number | undefined };

/**
 * What a cost ending says was spent: what the whole build had spent when its
 * cost budget stopped it, what was held for calls still in flight, and the
 * worst case of the call the purse refused (`../../llm/build-purse/`) -- absent
 * where the provider does not price or no call was refused.
 */
export type AutomationStudioFlowBootstrapCostSpending = {
  spentUsd: number;
  pendingUsd: number;
  projectedCostUsd?: number | undefined;
  /** What earlier builds of the same Flow creation spent, included in `spentUsd`. Absent when none. */
  carriedUsd?: number | undefined;
  /** What the purse kept back for judging the Flow, which the refused call had to leave (t254). Absent when nothing was. */
  keptBackUsd?: number | undefined;
  /**
   * The Flow creation's ceiling, where one purse holds every build of it
   * (t234): building again carries on from what is left of it, which the
   * person is told. Absent where the build was given no purse.
   */
  ceilingUsd?: number | undefined;
  /**
   * What the round the purse could not fund would have needed at worst, where
   * nothing was refused and the purse was not spent outright: what the person
   * is told it was too little for. Absent otherwise.
   */
  nextRound?: AutomationStudioFlowBootstrapNextRoundHold | undefined;
  /**
   * What testing and judging the Flow as it stood cost, where the refused call
   * would have eaten into the judging kept back and that reserve was spent
   * judging the Flow instead (t254 stage 2, `./reserve-judging.ts`). The other
   * figures are then the purse's after that judging, and the judge's account is
   * said. Absent otherwise.
   */
  judgedUsd?: number | undefined;
  /**
   * The refused call would have eaten into the judging kept back, and that
   * reserve was not spent: the Flow was unchanged since a judge of this build
   * said it does not do what was asked (t254 stage 3, `./phases.ts`), whose
   * account is said. The other figures are the refusal's. Absent otherwise.
   */
  unchangedSinceJudgedNo?: true | undefined;
};

/** The budget ending. */
export function automationStudioFlowBootstrapBudgetExhausted(input: {
  bound: AutomationStudioFlowBootstrapBudgetBound;
  sizes: AutomationStudioFlowBootstrapBudgetSizes;
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  rounds: number;
  decisions: number;
  /** Why each live round stopped, in order (`./tried.ts`). */
  stops?: AutomationStudioFlowBootstrapBuildEnding["tried"]["stops"] | undefined;
  /** Whether the steps found so far were kept for the next build. */
  kept: boolean;
  /**
   * The figures that stopped a `cost` ending, said only for one, so the person
   * reads what stopped it -- and, where they are a Flow creation's, what of its
   * ceiling building again has left.
   */
  spending?: AutomationStudioFlowBootstrapCostSpending | undefined;
}): AutomationStudioFlowBootstrapBuildEnding {
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const flowLeft = input.bound === "cost" && input.spending ? flowLeftSaid(input.spending) : "";
  const kept = automationStudioFlowBootstrapKeptSaid(input.kept, flowLeft);
  // A Flow the judge did not pass is already said so with how far it got (`./not-done.ts`), so its stop is not said
  // again as what held it up: "... not judged to do what you asked ... what held it up was that the Flow it thought
  // was ready was not judged to do what you asked" (t264 S3, one owner of the ending's words).
  const saidJudged = input.judgement.stopped === "judged_wrong" && input.judgement.judge !== undefined;
  const blocked = automationStudioFlowBootstrapBlockedSaid(input.judgement.lastIssueCodes)
    || (input.judgement.stopped === "budget" || saidJudged ? "" : automationStudioFlowBootstrapStopSaid(input.judgement.stopped));
  const tried = `${automationStudioFlowBootstrapWorkedLiveSaid(input.rounds)}.${blocked ? ` What held it up was that ${blocked}.` : ""}`;
  const spending = input.bound === "cost" && input.spending ? spendingSaid(input.spending, input.sizes.maxCostUsd) : "";
  const judged = input.bound === "cost" && (input.spending?.judgedUsd !== undefined || input.spending?.unchangedSinceJudgedNo);
  const message = automationStudioFlowBootstrapEndingFitted((room) => ({
    body: [
      `The build stopped at ${budgetSaid(input.bound, input.sizes)} before the Flow was finished${spending}.`,
      // How far it got and what its test found, said once: never "not judged" twice (`./not-done.ts`).
      automationStudioFlowBootstrapProgressAndTestSaid(input.checklist, input.judgement, room),
      judged ? judgeFoundSaid(input.judgement.judge, room.judge) : ""
    ],
    close: [tried, kept]
  }));
  return {
    kind: "budget_exhausted",
    message,
    bound: input.bound,
    notDone,
    tried: automationStudioFlowBootstrapTried(input)
  };
}

function budgetSaid(bound: AutomationStudioFlowBootstrapBudgetBound, sizes: AutomationStudioFlowBootstrapBudgetSizes): string {
  switch (bound) {
    case "cost": return sizes.maxCostUsd !== undefined ? `its spending limit of $${sizes.maxCostUsd.toFixed(2)}` : "its spending limit";
    case "duration": return sizes.maxDurationMs !== undefined ? `its time limit of ${Math.round(sizes.maxDurationMs / 60_000)} minutes` : "its time limit";
    case "tokens": return sizes.maxTotalTokens !== undefined ? `its budget of ${sizes.maxTotalTokens} tokens` : "its token budget";
    case "calls": return sizes.declaredCalls !== undefined ? `its limit of ${sizes.declaredCalls} model calls` : "its limit on model calls";
    // No build reaches it since t240 -- repairs are bounded by money and progress -- but published records may carry it.
    case "repair_rounds": return "its limit on repairs";
    case "rounds": return sizes.maxRounds !== undefined ? `its limit of ${sizes.maxRounds} live rounds` : "its limit on live rounds";
  }
}

/** What the build had spent -- earlier builds of the Flow's part named -- and what its refused call could have cost, as the person is told it. */
function spendingSaid(spending: AutomationStudioFlowBootstrapCostSpending, ceilingUsd: number | undefined): string {
  const carried = spending.carriedUsd !== undefined && spending.carriedUsd > 0 ? ` (${usd(spending.carriedUsd)} of it by earlier builds of this Flow)` : "";
  const held = spending.pendingUsd > 0 ? `, with ${usd(spending.pendingUsd)} more held for calls still running` : "";
  if (spending.judgedUsd !== undefined) {
    // The reserve kept back for judging went on judging the Flow as it stood, after the call that would have eaten into it was refused.
    const next = spending.projectedCostUsd !== undefined ? `its next call could have cost up to ${usd(spending.projectedCostUsd)}, more than was left beside` : "its next call did not fit beside";
    return `: ${next} what was kept back for judging the Flow, so that went on testing and judging the Flow as it stood (${usd(spending.judgedUsd)}), and it had spent ${usd(spending.spentUsd)}${carried} in all${held}`;
  }
  if (spending.unchangedSinceJudgedNo) {
    // The reserve kept back for judging was not spent: judging the Flow again, unchanged since the judge said no, would judge the same Flow.
    const next = spending.projectedCostUsd !== undefined ? `its next call could have cost up to ${usd(spending.projectedCostUsd)}, more than was left beside` : "its next call did not fit beside";
    const keptBack = spending.keptBackUsd !== undefined && spending.keptBackUsd > 0 ? `the ${usd(spending.keptBackUsd)} kept back for judging the Flow` : "what was kept back for judging the Flow";
    return `: ${next} ${keptBack}, and that was not spent, because the Flow was unchanged since the judge said it does not do what was asked, and it had spent ${usd(spending.spentUsd)}${carried} in all${held}`;
  }
  const spent = `: it had spent ${usd(spending.spentUsd)}${carried}${held}`;
  const keptBack = spending.keptBackUsd !== undefined && spending.keptBackUsd > 0 ? `, ${usd(spending.keptBackUsd)} was kept back for judging the Flow` : "";
  if (spending.projectedCostUsd !== undefined) return `${spent}${keptBack}, and its next call could have cost up to ${usd(spending.projectedCostUsd)}`;
  const left = leftOf(spending.ceilingUsd ?? ceilingUsd, spending);
  if (spending.nextRound && left >= 0.0005) return `${spent}, which left ${usd(left)}, too little for another round: ${nextRoundSaid(spending.nextRound)}`;
  return left >= 0.0005 ? `${spent}, which left ${usd(left)}, too little for its next call` : `${spent}, which left nothing for its next call`;
}

/**
 * What the judge found of the Flow as it stood, where the judging reserve was
 * spent judging it, or where a judge had said no to it unchanged: what it
 * observed or its first finding, and what it says is
 * left to change; or why it could not confirm the Flow. Empty when it said
 * nothing. Its words are screened plain and said in whole sentences
 * (`./judge-words.ts`, t276), never a quote cut short.
 */
function judgeFoundSaid(judge: AutomationStudioFlowBootstrapJudgement["judge"], most: number): string {
  if (!judge) return "";
  const finding = automationStudioFlowBootstrapJudgeWordsSaid(automationStudioFlowBootstrapUnsettledForBuild(judge.observed ?? judge.findings[0] ?? ""), most);
  if (judge.verdict !== "no") return finding ? `The judge could not confirm it: ${finding}` : "";
  const advice = automationStudioFlowBootstrapJudgeWordsSaid(judge.advice ?? "", most);
  return [finding ? `The judge found: ${finding}` : "", advice ? `What the judge says is left to change: ${advice}` : ""].filter(Boolean).join(" ");
}

/** What another round needed at least, as the person is told it. */
function nextRoundSaid(next: AutomationStudioFlowBootstrapNextRoundHold): string {
  if (next.judged && next.judgingUsd !== undefined && next.decisionUsd !== undefined) {
    return `judging its Flow takes two judge calls held at up to ${usd(next.judgingUsd)}, and its first decision at least ${usd(next.decisionUsd)} more`;
  }
  return next.judged ? `its first decision and the judging of its Flow need at least ${usd(next.usd)}` : `its first decision needs at least ${usd(next.usd)}`;
}

/** What a Flow creation's ceiling has left for building again, as the kept sentence ends; nothing where the build had no purse. */
function flowLeftSaid(spending: AutomationStudioFlowBootstrapCostSpending): string {
  if (spending.ceilingUsd === undefined) return "";
  const left = leftOf(spending.ceilingUsd, spending);
  const ceiling = `this Flow's $${spending.ceilingUsd.toFixed(2)}`;
  return left >= 0.0005 ? `, with ${usd(left)} left of ${ceiling}` : `, with nothing left of ${ceiling}`;
}

function leftOf(ceilingUsd: number | undefined, spending: AutomationStudioFlowBootstrapCostSpending): number {
  return ceilingUsd === undefined ? 0 : Math.max(0, ceilingUsd - spending.spentUsd - spending.pendingUsd);
}

function usd(amount: number): string {
  return `$${amount.toFixed(3)}`;
}
