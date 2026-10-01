// A budget ran out before the Flow was finished: reported as exactly that.
//
// The user's rule (2026-09-30): a budget or cost ceiling that is hit is said
// as the budget it is, never dressed up as "not doable" -- a build that ran
// out of money had a route it did not get to finish. So the message names the
// budget and its size, what of the request the Flow already does, what was
// tried and what blocked it, and whether the Flow so far was kept for the next
// build to carry on from. It is also how a build that authored nothing ends
// (supervisor, t208): never as a bare code, always with this message.
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
  automationStudioFlowBootstrapNotDoneSaid,
  automationStudioFlowBootstrapStopSaid,
  automationStudioFlowBootstrapTestSaid
} from "./not-done.ts";

/** The size of each budget, as the person is told it. */
export type AutomationStudioFlowBootstrapBudgetSizes = {
  maxCostUsd?: number | undefined;
  maxDurationMs?: number | undefined;
  maxTotalTokens?: number | undefined;
  declaredCalls?: number | undefined;
  maxRepairRounds: number;
  maxRounds?: number | undefined;
};

/** The budget ending. */
export function automationStudioFlowBootstrapBudgetExhausted(input: {
  bound: AutomationStudioFlowBootstrapBudgetBound;
  sizes: AutomationStudioFlowBootstrapBudgetSizes;
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  rounds: number;
  decisions: number;
  /** Whether the Flow so far was kept for the next build. */
  kept: boolean;
}): AutomationStudioFlowBootstrapBuildEnding {
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const asked = (input.checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  const progress = asked
    ? ` ${asked - notDone.length} of the ${asked} things you asked are done${notDone.length ? `; still to do: ${automationStudioFlowBootstrapNotDoneSaid(notDone)}` : ""}.`
    : "";
  const kept = input.kept
    ? " The Flow so far was kept, and building again carries on from it."
    : " Nothing was kept to carry on from.";
  const blocked = automationStudioFlowBootstrapBlockedSaid(input.judgement.lastIssueCodes)
    || (input.judgement.stopped === "budget" ? "" : automationStudioFlowBootstrapStopSaid(input.judgement.stopped));
  const tried = `I explored live ${input.rounds === 1 ? "once" : `${input.rounds} times`} over ${input.decisions} decisions${blocked ? `, and what held it up was that ${blocked}` : ""}.`;
  const message = [`The build stopped at ${budgetSaid(input.bound, input.sizes)} before the Flow was finished.${progress}`, automationStudioFlowBootstrapTestSaid(input.judgement), tried, kept.trim()]
    .filter(Boolean)
    .join(" ");
  return {
    kind: "budget_exhausted",
    message: message.slice(0, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE),
    bound: input.bound,
    notDone,
    tried: { rounds: input.rounds, decisions: input.decisions, stepsInFlow: input.judgement.stepsInFlow, tested: input.judgement.tested }
  };
}

function budgetSaid(bound: AutomationStudioFlowBootstrapBudgetBound, sizes: AutomationStudioFlowBootstrapBudgetSizes): string {
  switch (bound) {
    case "cost": return sizes.maxCostUsd !== undefined ? `its spending limit of $${sizes.maxCostUsd.toFixed(2)}` : "its spending limit";
    case "duration": return sizes.maxDurationMs !== undefined ? `its time limit of ${Math.round(sizes.maxDurationMs / 60_000)} minutes` : "its time limit";
    case "tokens": return sizes.maxTotalTokens !== undefined ? `its budget of ${sizes.maxTotalTokens} tokens` : "its token budget";
    case "calls": return sizes.declaredCalls !== undefined ? `its limit of ${sizes.declaredCalls} model calls` : "its limit on model calls";
    case "repair_rounds": return `its limit of ${sizes.maxRepairRounds} repairs, while each repair was still getting further`;
    case "rounds": return sizes.maxRounds !== undefined ? `its limit of ${sizes.maxRounds} live rounds` : "its limit on live rounds";
  }
}
