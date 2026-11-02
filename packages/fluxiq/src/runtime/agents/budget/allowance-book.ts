// The allowances a purse has carved, and what they still hold of it (t534).
//
// The project supervisor gives each brief an allowance from the build's purse
// (`./purse.ts`, `allowance`). An open allowance is a promise: what it has not
// yet spent or put in flight is kept from every other call on the purse, so a
// builder that was given $0.03 can spend $0.03 whatever its siblings and the
// supervisor do meanwhile. Closing it ends the promise, and what it left goes
// back to the purse. Spend is attributed to the brief and role that made it.
//
// An allowance is a purse whose parent is the purse it was carved from: every
// call made under it is held against it and against each purse above it, and
// either refusing refuses the call. It can only be carved from what the parent
// has left less its judging reserve and less what open allowances still hold.
// Its refusal is its own, and so is the refusal of each run made under it
// (`./run-frame.ts`), so concurrent builders end on their own money, never on a
// sibling's.
//
// **Calls are carved the way dollars are (t570).** An allowance used to cap
// its own calls (`maxCalls`) without taking them from the purse it was carved
// from, so one builder could spend the build's calls while its own cap still
// said it had plenty: on A8 round 1 (`run-mv7vl89u-917d62a6`, bigbox) a brief
// capped at 90 calls was refused `llm_budget.run_call_limit` after 11, the
// build's 64 spent, and its wrap-up never came. Now a call cap is carved only
// from the calls the purse has left less its judging reserve, less what open
// allowances still hold, and less what the purse keeps back from every
// allowance (`keepBackCallsFromAllowances`: the supervisor's assembly, test and
// completion, and a reset before the whole test). An open allowance's unspent
// calls are kept from every other call on the purse, as its dollars are. Only a
// request that says it is for that finishing work (`fromKeptBack`, a reset
// brief's) may carve from what is kept back.
//
// **A share, not a wall (t627).** An allowance whose next call does not fit it
// is topped up from what the purse could still carve, beyond what the purse's
// own finishing calls are kept at, when that can pay (`./top-up.ts`); each grant
// is listed with its allowance's spend (`topUps`).

import { AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD } from "./epsilon.ts";
import type { AutomationStudioLlmBuildPurse } from "./purse.ts";
import type { AutomationStudioLlmBuildPurseTopUp } from "./top-up.ts";

/** Who an allowance was carved for: the agent role and the brief it serves. */
export type AutomationStudioLlmBuildPurseAttribution = {
  role: string;
  briefId: string;
};

/** An allowance asked of a purse: `usd` for `briefId`'s `role`, and at most `maxCalls` calls when given. */
export type AutomationStudioLlmBuildPurseAllowanceRequest = AutomationStudioLlmBuildPurseAttribution & {
  usd: number;
  maxCalls?: number;
  /** The allowance is for the finishing work the purse keeps calls back for (a reset before the whole test), so it may carve from them. */
  fromKeptBack?: boolean;
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
  /** The calls asked, when the request capped its calls. */
  requestedCalls?: number;
  /** The calls the purse could still carve, when it caps its calls: its cap less what is spent, in flight, kept back and promised to open allowances. */
  allocatableCalls?: number;
};

/** What one allowance has spent, by the role and brief it was carved for. */
export type AutomationStudioLlmBuildPurseAttributedSpend = AutomationStudioLlmBuildPurseAttribution & {
  /** What the allowance was carved at; its top-ups are listed apart. */
  allottedUsd: number;
  /** What it drew from the purse it was carved from when its next call did not fit (t627). Absent when it drew nothing. */
  topUps?: AutomationStudioLlmBuildPurseTopUp[];
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

  /**
   * Why `request` cannot be carved from `from`, or `undefined` when it can:
   * refused, in figures, when `usd` is more than `from.allocatableUsd()`, so the
   * judging reserve is never allocatable. Throws on a request that names no
   * brief or role, asks a negative or non-finite amount, or names a brief whose
   * allowance is still open: one open allowance per brief.
   */
  carvingRefusal(request: AutomationStudioLlmBuildPurseAllowanceRequest, from: AutomationStudioLlmBuildPurse): AutomationStudioLlmBuildPurseAllowanceRefusal | undefined {
    if (!request.briefId || !request.role) throw new Error("An allowance must name the brief and the role it is carved for.");
    if (!Number.isFinite(request.usd) || request.usd < 0) throw new Error("An allowance must be a finite, non-negative amount.");
    if (request.maxCalls !== undefined && (!Number.isSafeInteger(request.maxCalls) || request.maxCalls < 1)) throw new Error("An allowance's call cap must be a positive safe integer.");
    if (this.hasOpen(request.briefId)) throw new Error(`An allowance for brief ${request.briefId} is already open.`);
    const allocatableUsd = from.allocatableUsd();
    const allocatableCalls = from.allocatableCalls({ fromKeptBack: request.fromKeptBack === true });
    const usdFits = request.usd <= allocatableUsd + AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD;
    const callsFit = request.maxCalls === undefined || allocatableCalls === undefined || request.maxCalls <= allocatableCalls;
    if (usdFits && callsFit) return undefined;
    return {
      code: "llm_budget.allowance_unavailable", requestedUsd: request.usd, allocatableUsd, keptBackUsd: from.keptBackUsd(), outstandingUsd: this.outstandingUsd(),
      ...(request.maxCalls !== undefined ? { requestedCalls: request.maxCalls } : {}),
      ...(allocatableCalls !== undefined ? { allocatableCalls } : {})
    };
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

  /** What open allowances other than `except` may still call: each capped one's calls neither settled nor in flight. Kept from every other call on the purse. */
  outstandingCalls(except?: AutomationStudioLlmBuildPurse): number {
    let outstanding = 0;
    for (const allowance of this.open) {
      if (allowance !== except) outstanding += allowance.unspentCalls() ?? 0;
    }
    return outstanding;
  }

  /** Every allowance carved, open or closed, and those carved from them, in the order they were carved. */
  spend(): AutomationStudioLlmBuildPurseAttributedSpend[] {
    return this.carved.flatMap((allowance) => {
      const topUps = allowance.toppedUp();
      return [{
        role: allowance.attribution?.role ?? "",
        briefId: allowance.attribution?.briefId ?? "",
        allottedUsd: allowance.carvedUsd,
        spentUsd: allowance.spentUsd(),
        calls: allowance.spentCalls(),
        closed: allowance.isClosed(),
        ...(topUps.length > 0 ? { topUps } : {})
      },
      ...allowance.attributedSpend()];
    });
  }
}
