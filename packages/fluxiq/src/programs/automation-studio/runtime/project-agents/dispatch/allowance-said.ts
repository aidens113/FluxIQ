import type { AutomationStudioLlmBuildPurseTopUp } from "../../llm/build-purse/index.ts";

// What a brief's return says of its money beyond what it spent (t627), in
// figures only: what it was given when it started, where that was less than the
// dispatch sized it at (`./start-allowance.ts`), and each top-up it drew from
// the build's purse when its next call did not fit (`llm/build-purse/top-up.ts`).
// The supervisor reads it in the return, and the build record holds the return,
// so a brief that spent more than it was sized at is never a mystery.

/** The grants a return names one by one; the rest are counted. */
const MAX_GRANTS_NAMED = 5;

/** What a brief started with, where it differs from what the dispatch sized it at. */
export type AutomationStudioProjectDispatchSizedAtStart = {
  allowanceUsd: number;
  dispatchedUsd: number;
  maxCalls?: number;
  dispatchedCalls?: number;
};

const usd = (value: number): string => `$${value.toFixed(4)}`;

/** The sentences a return's reason ends with, or nothing when the brief started as sized and drew no top-up. */
export function automationStudioProjectDispatchAllowanceSaid(sized: AutomationStudioProjectDispatchSizedAtStart | undefined, topUps: readonly AutomationStudioLlmBuildPurseTopUp[]): string {
  const said: string[] = [];
  if (sized) {
    const calls = sized.maxCalls !== undefined && sized.dispatchedCalls !== undefined && sized.maxCalls !== sized.dispatchedCalls ? ` and ${sized.maxCalls} calls of ${sized.dispatchedCalls}` : "";
    said.push(`It started after its predecessor with an allowance of ${usd(sized.allowanceUsd)} of the ${usd(sized.dispatchedUsd)} it was sized at${calls}: its share of what the build's purse could then give.`);
  }
  if (topUps.length) {
    const total = topUps.reduce((sum, grant) => sum + grant.usd, 0);
    const named = topUps.slice(0, MAX_GRANTS_NAMED).map((grant) => `${usd(grant.usd)} when a call held at ${usd(grant.heldUsd)} was ${usd(grant.shortfallUsd)} short`);
    const more = topUps.length > MAX_GRANTS_NAMED ? `, and ${topUps.length - MAX_GRANTS_NAMED} more` : "";
    said.push(`Its allowance was topped up from the build's purse ${topUps.length === 1 ? "once" : `${topUps.length} times`}, ${usd(total)} in all (llm_budget.allowance_topped_up): ${named.join("; ")}${more}.`);
  }
  return said.length ? ` ${said.join(" ")}` : "";
}
