// An allowance topped up from the purse it was carved from, when its next call
// does not fit it but the purse can pay (t627).
//
// **An allowance is a share of the Flow's purse, not a wall (user).** On A8 wave 6
// (`run-mv9a48cs-8fff527c`, everything-store) a two-subflow plan split the
// build's money into briefs of $0.077 each. The first builder was refused
// `llm_budget.run_cost_limit` with $0.018 of its allowance left against a next
// call priced at about $0.025 at worst, while the build's purse still held $0.184:
// one test short of trialling its last revision, so its subflow never passed and
// the second brief, which starts after it, never ran.
//
// So when an allowance's next call does not fit it, the allowance asks the purse
// it was carved from for the difference before it refuses
// (`./purse.ts`, `holdFor`). The purse grants it only from what it could carve
// (`allocatableUsd`: never what is spent, in flight, kept back for judging the
// whole run and one repair round, or still held by another open allowance), and
// only beyond what its own finishing needs (below). Each grant is recorded on the
// allowance with its amount and reason (`topUps`). When the purse cannot pay,
// nothing is granted and the allowance refuses exactly as before. The ceiling
// above is never raised: the call is still held against every purse above, the
// Flow's included.
//
// **The bound.**
// - **Each grant** is what the call is short plus the call's own hold again: it
//   pays this call and leaves room for one more like it. Calls are held at their
//   worst case and settle at what they cost, about a tenth of it on a cached
//   request, so one grant carries a builder for several calls, and the loop's
//   count of decisions left (`../loop-budget.ts`, which reads the allowance's
//   ceiling) is not put straight back into its wrap-up. A grant of the shortfall
//   alone would leave the builder at its last decision after every call.
// - **All of an allowance's grants together** are at most what it was carved at:
//   a brief may spend up to twice its share and no more. Past that its spending,
//   not its share, is what is wrong, and its return lets the supervisor decide
//   whether to give it more through a new brief.
// - **What the purse keeps for its own finishing.** The purse keeps calls back
//   from every allowance for the build's finishing (`keepBackCallsFromAllowances`:
//   the supervisor's assembly, the whole trial's reset and test, its completion),
//   but no dollars: the share the brief sizing leaves for them
//   (`project-agents/supervisor/brief-sizing.ts`) is only not carved. A grant
//   leaves those calls' price: the first at the worst case of the call asking (or
//   the largest the purse priced, whichever is more), the rest at what the
//   purse's calls have settled at on average -- the way the loop counts the
//   decisions it has left. Their judging is in the judging reserve already.
//
// **What later briefs see.** A grant raises the allowance's ceiling, so while it
// is open the purse keeps what it has not spent of it from every other call, as
// it does any allowance's; once it closes, only what it spent stays taken. The
// supervisor sizes each later dispatch from `allocatableUsd`, so a brief sent
// after a grant is sized from the smaller remainder, with no figure of its own.

import { AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD } from "./epsilon.ts";

/** One grant an allowance drew from the purse it was carved from. */
export type AutomationStudioLlmBuildPurseTopUp = {
  /** What was granted: added to the allowance's ceiling. */
  usd: number;
  /** What the call was short of fitting the allowance. */
  shortfallUsd: number;
  /** The call's hold: its worst case, or the most a call has reported costing where the provider does not price. */
  heldUsd: number;
  /** What the purse could still give beyond its judging reserve, other open allowances and its own finishing, before this grant. */
  availableUsd: number;
  /** Why, in words. */
  reason: string;
};

/** The purse's figures a grant is decided from. */
export type AutomationStudioLlmBuildPurseTopUpAsk = {
  shortfallUsd: number;
  heldUsd: number;
  /** What the purse could carve now (`allocatableUsd`). */
  allocatableUsd: number;
  /** The calls the purse keeps back for its own finishing, and what to price them at. */
  finishing: { calls: number; worstUsd: number; averageUsd: number | undefined };
};

const usd = (value: number): string => `$${value.toFixed(4)}`;

/** An allowance's grants from the purse it was carved from, and what is left of their bound (header). */
export class AutomationStudioLlmBuildPurseTopUps {
  private readonly granted: AutomationStudioLlmBuildPurseTopUp[] = [];

  constructor(private readonly carvedUsd: number) {}

  /** What every grant added, summed. */
  toppedUpUsd(): number {
    return this.granted.reduce((sum, grant) => sum + grant.usd, 0);
  }

  /** Every grant, in the order granted. */
  list(): AutomationStudioLlmBuildPurseTopUp[] {
    return this.granted.map((grant) => ({ ...grant }));
  }

  /**
   * Grant what `ask` needs, record it and return it; or `undefined`, granting
   * nothing, when the bound or the purse cannot pay the whole shortfall.
   */
  grant(ask: AutomationStudioLlmBuildPurseTopUpAsk): AutomationStudioLlmBuildPurseTopUp | undefined {
    const room = Math.max(0, this.carvedUsd - this.toppedUpUsd());
    const availableUsd = Math.max(0, ask.allocatableUsd - finishingUsd(ask.finishing));
    const most = Math.min(room, availableUsd);
    // The purse's own slack, so a shortfall that lands exactly on what is left is granted.
    if (!(ask.shortfallUsd > 0) || ask.shortfallUsd > most + AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD) return undefined;
    const grantUsd = Math.min(ask.shortfallUsd + ask.heldUsd, most);
    const grant: AutomationStudioLlmBuildPurseTopUp = {
      usd: grantUsd,
      shortfallUsd: ask.shortfallUsd,
      heldUsd: ask.heldUsd,
      availableUsd,
      reason: `The next call, held at ${usd(ask.heldUsd)}, was ${usd(ask.shortfallUsd)} short of this allowance; the build's purse could still give ${usd(availableUsd)} beyond its judging reserve, other briefs' allowances and its own finishing, so ${usd(grantUsd)} was added.`
    };
    this.granted.push(grant);
    return grant;
  }

  /** Take back `grant`, one this granted, when the call it was for was refused above all the same. */
  withdraw(grant: AutomationStudioLlmBuildPurseTopUp): void {
    const at = this.granted.indexOf(grant);
    if (at >= 0) this.granted.splice(at, 1);
  }
}

/** What the purse's own finishing calls are kept at: the first at the worst case, the rest at the average settled call (header). */
function finishingUsd(finishing: AutomationStudioLlmBuildPurseTopUpAsk["finishing"]): number {
  if (finishing.calls <= 0) return 0;
  const average = finishing.averageUsd ?? finishing.worstUsd;
  return finishing.worstUsd + (finishing.calls - 1) * average;
}
