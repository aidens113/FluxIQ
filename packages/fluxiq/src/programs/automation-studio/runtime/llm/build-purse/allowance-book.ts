// The allowances a purse has carved, and what they still hold of it (t534).
//
// The project supervisor gives each brief an allowance from the build's purse
// (`./purse.ts`, `allowance`). An open allowance is a promise: what it has not
// yet spent or put in flight is kept from every other call on the purse, so a
// builder that was given $0.03 can spend $0.03 whatever its siblings and the
// supervisor do meanwhile. Closing it ends the promise, and what it left goes
// back to the purse. Spend is attributed to the brief and role that made it.

import type { AutomationStudioLlmBuildPurse } from "./purse.ts";

/** Who an allowance was carved for: the agent role and the brief it serves. */
export type AutomationStudioLlmBuildPurseAttribution = {
  role: string;
  briefId: string;
};

/** An allowance asked of a purse: `usd` for `briefId`'s `role`, and at most `maxCalls` calls when given. */
export type AutomationStudioLlmBuildPurseAllowanceRequest = AutomationStudioLlmBuildPurseAttribution & {
  usd: number;
  maxCalls?: number;
};

/** Why an allowance could not be carved, in figures. */
export type AutomationStudioLlmBuildPurseAllowanceRefusal = {
  code: "llm_budget.allowance_unavailable";
  requestedUsd: number;
  /** What the purse could still carve: its ceiling less what is spent, in flight, kept back for judging and promised to open allowances. */
  allocatableUsd: number;
  /** What the purse keeps back for judging, which no allowance may take. */
  keptBackUsd: number;
  /** What open allowances still hold of the purse. */
  outstandingUsd: number;
};

/** What one allowance has spent, by the role and brief it was carved for. */
export type AutomationStudioLlmBuildPurseAttributedSpend = AutomationStudioLlmBuildPurseAttribution & {
  /** The allowance's ceiling. */
  allottedUsd: number;
  /** What its settled calls were charged. */
  spentUsd: number;
  /** Its settled calls. */
  calls: number;
  /** Whether it was closed, giving what it left back. */
  closed: boolean;
};

export class AutomationStudioLlmBuildPurseAllowanceBook {
  private readonly open = new Set<AutomationStudioLlmBuildPurse>();
  private readonly carved: AutomationStudioLlmBuildPurse[] = [];

  /** Whether an allowance for `briefId` is still open. */
  hasOpen(briefId: string): boolean {
    for (const allowance of this.open) {
      if (allowance.attribution?.briefId === briefId) return true;
    }
    return false;
  }

  add(allowance: AutomationStudioLlmBuildPurse): void {
    this.open.add(allowance);
    this.carved.push(allowance);
  }

  close(allowance: AutomationStudioLlmBuildPurse): void {
    this.open.delete(allowance);
  }

  /** What open allowances other than `except` have neither spent nor put in flight: kept from every other call on the purse. */
  outstandingUsd(except?: AutomationStudioLlmBuildPurse): number {
    let outstanding = 0;
    for (const allowance of this.open) {
      if (allowance !== except) outstanding += allowance.leftUsd();
    }
    return outstanding;
  }

  /** Every allowance carved, open or closed, and those carved from them, in the order they were carved. */
  spend(): AutomationStudioLlmBuildPurseAttributedSpend[] {
    return this.carved.flatMap((allowance) => [
      {
        role: allowance.attribution?.role ?? "",
        briefId: allowance.attribution?.briefId ?? "",
        allottedUsd: allowance.ceilingUsd,
        spentUsd: allowance.spentUsd(),
        calls: allowance.spentCalls(),
        closed: allowance.isClosed()
      },
      ...allowance.attributedSpend()
    ]);
  }
}
