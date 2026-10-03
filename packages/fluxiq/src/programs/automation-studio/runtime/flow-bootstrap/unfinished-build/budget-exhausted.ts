// A budget ran out before the Flow was finished: reported as exactly that.
//
// The user's rule (2026-09-30): a budget or cost ceiling that is hit is said
// as the budget it is, never dressed up as "not doable" -- a build that ran
// out of money had a route it did not get to finish. So the message names the
// budget and its size, what of the request the Flow already does, what was
// tried and what blocked it, and whether the Flow so far was kept for the next
// build to carry on from. It is also how a build that authored nothing ends
// (supervisor, t208): never as a bare code, always with this message. A cost
// ending says the figures that stopped it (F41); where one purse holds the
// Flow's whole creation (t234), also what earlier builds of the Flow spent of
// them and what of the Flow's ceiling building again has left. What was kept
// is said as a draft not put into the Flow (`./kept-said.ts`; t195-w37, live
// run `run-murz83zy-5030820f`, whose chat also said the Flow was left empty).
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE,
  type AutomationStudioFlowBootstrapBudgetBound,
  type AutomationStudioFlowBootstrapBuildEnding
} from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "./contracts.ts";
import {
  automationStudioFlowBootstrapBlockedSaid,
  automationStudioFlowBootstrapNotDone,
  automationStudioFlowBootstrapProgressSaid,
  automationStudioFlowBootstrapStopSaid,
  automationStudioFlowBootstrapTestSaid
} from "./not-done.ts";
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
 * One more round's worst case under the purse (t240): its next decision and,
 * where `judged`, the judging of its Flow, each at its capped hold
 * (`./phases.ts`). A round is not opened that the purse cannot fund for it.
 */
export type AutomationStudioFlowBootstrapNextRoundHold = { usd: number; judged: boolean };

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
  /** Whether the Flow so far was kept for the next build. */
  kept: boolean;
  /**
   * The figures that stopped a `cost` ending, said only for one, so the person
   * reads what stopped it -- and, where they are a Flow creation's, what of its
   * ceiling building again has left.
   */
  spending?: AutomationStudioFlowBootstrapCostSpending | undefined;
}): AutomationStudioFlowBootstrapBuildEnding {
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const said = automationStudioFlowBootstrapProgressSaid(input.checklist, input.judgement);
  const progress = said ? ` ${said}` : "";
  const flowLeft = input.bound === "cost" && input.spending ? flowLeftSaid(input.spending) : "";
  const kept = automationStudioFlowBootstrapKeptSaid(input.kept, flowLeft);
  const blocked = automationStudioFlowBootstrapBlockedSaid(input.judgement.lastIssueCodes)
    || (input.judgement.stopped === "budget" ? "" : automationStudioFlowBootstrapStopSaid(input.judgement.stopped));
  const tried = `I explored live ${input.rounds === 1 ? "once" : `${input.rounds} times`} over ${input.decisions} decisions${blocked ? `, and what held it up was that ${blocked}` : ""}.`;
  const spending = input.bound === "cost" && input.spending ? spendingSaid(input.spending, input.sizes.maxCostUsd) : "";
  const message = [`The build stopped at ${budgetSaid(input.bound, input.sizes)} before the Flow was finished${spending}.${progress}`, automationStudioFlowBootstrapTestSaid(input.judgement), tried, kept]
    .filter(Boolean)
    .join(" ");
  return {
    kind: "budget_exhausted",
    message: message.slice(0, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE),
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
  const spent = `: it had spent ${usd(spending.spentUsd)}${carried}${held}`;
  if (spending.projectedCostUsd !== undefined) return `${spent}, and its next call could have cost up to ${usd(spending.projectedCostUsd)}`;
  const left = leftOf(spending.ceilingUsd ?? ceilingUsd, spending);
  if (spending.nextRound && left >= 0.0005) {
    const round = spending.nextRound.judged ? "its next decision and the judging of its Flow" : "its next decision";
    return `${spent}, which left ${usd(left)}, too little for another round: ${round} could cost up to ${usd(spending.nextRound.usd)}`;
  }
  return left >= 0.0005 ? `${spent}, which left ${usd(left)}, too little for its next call` : `${spent}, which left nothing for its next call`;
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
