// A build's purse: its cost ceiling, held against every call before it is sent.
//
// **Why a build needs one of its own.** A build has no run ledger
// (`../run-budget.ts`); its ceiling -- the run cost ceiling, $0.25 then and
// $0.10 in Lab test scope, or the Flow's lower setting -- was
// held only by the loop's arithmetic (`../loop-budget.ts`), which counts
// decisions left at the *average* reported cost of the ones before. Reported
// costs are cache-discounted and the request grows every decision, so the
// average says nothing about the next call. On `run-mup2u8o3-6697c4be` eight
// decisions averaged $0.019; the ninth was sent with $0.154 spent, re-read
// 475,714 of its 477,506 input tokens uncached, and cost $0.1429: $0.297 against
// that $0.25, and nothing in Core counted it as a breach.
//
// So before a call goes out its worst case is projected from the request
// actually about to be sent (`./projected-cost.ts`, priced by the harness from
// its own measure of that request), and a call that would take what was spent,
// what is in flight and its own worst case past the ceiling is refused, never
// sent. A call that then reports costing more than it was held at is a breach,
// counted with its overshoot in dollars (`overshootUsd`).
//
// **One purse per Flow creation, and the only cost authority (t234).** The
// user's limit is a Flow's: the resolved normal policy, or the Lab-only scoped
// FLUXIQ_LLM_RUN_COST_CEILING_USD when testing it. Two counts used to stop a build -- this purse and the loop's own
// count of decisions left (`../loop-budget.ts`), which held back an extra
// average decision and stopped `run-muqbzu32-8691a65e` with $0.026 unspent and
// no figures -- and every round, the judge and every later build each started
// from a fresh share. Now one purse is opened for a build with what earlier
// builds of the same Flow creation spent (`carriedUsd`), every call the build
// makes is held against it (`./run.ts`, `automationStudioLlmBuildPurseScope`):
// the instruction reading, each round's decisions, the test and the judge. The
// loop's count only tells the model what is left; a refusal here is the only
// cost ending.
//
// A provider that does not price leaves nothing to project. Such a call is held
// at the most any call on this purse has reported costing -- a measured figure,
// nothing until one has reported -- so a run of like calls stops before the one
// that would cross the ceiling, not after it. The loop's own count used to stop
// such a build first, and with that count gone the purse is what holds it
// (t234: a refuted result's repair ladder spent $0.12 of $0.10 without it).
// Holding it at the whole ceiling instead would refuse every call after the
// first one that cost anything.
//
// **Its parts.** Each call's hold and its settlement, and the breaches a reply
// beyond its reserve makes, are kept by `./settlement-ledger.ts`; the judging
// kept back from every other call by `./judging-reserve.ts` (t254); the
// allowances carved from the purse for each brief by `./allowance-book.ts`
// (t534); the top-ups an allowance draws from the purse it was carved from when
// its next call does not fit it (`./top-up.ts`, t627); the backstop a judge
// call an allowance cannot pay is held against instead (`./judge-backstop.ts`,
// t685); and a refusal's figures are written by `./cost-refusal.ts`. This class composes them and decides,
// call by call, whether a call is held.

import { AutomationStudioLlmBuildPurseAllowanceBook, type AutomationStudioLlmBuildPurseAllowanceRefusal, type AutomationStudioLlmBuildPurseAllowanceRequest, type AutomationStudioLlmBuildPurseAttributedSpend, type AutomationStudioLlmBuildPurseAttribution } from "./allowance-book.ts";
import { automationStudioLlmBuildPurseCostRefusal } from "./cost-refusal.ts";
import { AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD } from "./epsilon.ts";
import { AutomationStudioLlmBuildPurseJudgingReserve } from "./judging-reserve.ts";
import { automationStudioLlmBuildPurseFramesOf, automationStudioLlmBuildPurseJudgeBackstopOf } from "./run-frame.ts";
import { AutomationStudioLlmBuildPurseLedger } from "./settlement-ledger.ts";
import { AutomationStudioLlmBuildPurseTopUps, type AutomationStudioLlmBuildPurseTopUp } from "./top-up.ts";
import type { AutomationStudioLlmBuildPurseCall, AutomationStudioLlmBuildPurseCharged, AutomationStudioLlmBuildPurseHeld, AutomationStudioLlmBuildPurseJudging, AutomationStudioLlmBuildPurseOptions, AutomationStudioLlmBuildPurseRefusal } from "./types.ts";

/** What ties an allowance to the purse it was carved from. Set only by `allowance`. */
type AutomationStudioLlmBuildPurseLink = {
  parent: AutomationStudioLlmBuildPurse;
  attribution: AutomationStudioLlmBuildPurseAttribution;
};

export class AutomationStudioLlmBuildPurse {
  /** What the purse was opened, or the allowance carved, at. */
  readonly carvedUsd: number;
  /** The worst case of the last call it priced: the least the next, larger request can cost at worst. */
  lastProjectedCostUsd: number | undefined;
  /** What earlier builds of the same Flow creation spent: part of `spentUsd`, never charged again. */
  readonly carriedUsd: number;
  /** The purse this allowance was carved from; absent on a build's or a Flow's own purse. */
  readonly parent: AutomationStudioLlmBuildPurse | undefined;
  /** The role and brief this allowance was carved for; absent on a build's or a Flow's own purse. */
  readonly attribution: AutomationStudioLlmBuildPurseAttribution | undefined;
  /** What this purse's calls were held at and charged. */
  private readonly ledger: AutomationStudioLlmBuildPurseLedger;
  /** Judging kept back from every other call, once the build's phases ask for it. */
  private readonly judgingReserve = new AutomationStudioLlmBuildPurseJudgingReserve();
  /** The last refusal, for a reader outside any scope or run of this purse (`./run-frame.ts`). */
  private lastRefusal: AutomationStudioLlmBuildPurseRefusal | undefined;
  /** Allowances carved from this purse. */
  private readonly allowances = new AutomationStudioLlmBuildPurseAllowanceBook();
  /** Calls no allowance may be carved from but one for the finishing work they are kept for (`keepBackCallsFromAllowances`). */
  private allowanceKeptBackCalls = 0;
  private closed = false;
  /** What this allowance drew from the purse it was carved from (`./top-up.ts`); none on a build's or a Flow's own purse. */
  private readonly topUps: AutomationStudioLlmBuildPurseTopUps;

  constructor(private readonly options: AutomationStudioLlmBuildPurseOptions, link?: AutomationStudioLlmBuildPurseLink) {
    if (!Number.isFinite(options.ceilingUsd) || options.ceilingUsd < 0) throw new Error("A build purse's ceiling must be a finite, non-negative amount.");
    const carried = options.carriedUsd ?? 0;
    if (!Number.isFinite(carried) || carried < 0) throw new Error("A build purse's carried spend must be a finite, non-negative amount.");
    this.ledger = new AutomationStudioLlmBuildPurseLedger(options.maxCalls, options);
    this.carvedUsd = options.ceilingUsd;
    this.topUps = new AutomationStudioLlmBuildPurseTopUps(options.ceilingUsd);
    this.carriedUsd = carried;
    this.parent = link?.parent;
    this.attribution = link ? { ...link.attribution } : undefined;
  }

  /** The most this purse may spend: what it was carved at, plus what an allowance was topped up with (`./top-up.ts`). */
  get ceilingUsd(): number {
    return this.carvedUsd + this.topUps.toppedUpUsd();
  }

  /** Every top-up this allowance drew from the purse it was carved from, with its amount and reason; none on a build's or a Flow's own purse. */
  toppedUp(): AutomationStudioLlmBuildPurseTopUp[] {
    return this.topUps.list();
  }

  /** Calls that reported costing more than they were held at. */
  get breaches(): number {
    return this.ledger.breaches;
  }

  /** What those calls cost beyond their holds, summed: by how much the purse's holds were short, which is how far past its ceiling it can have gone. */
  get overshootUsd(): number {
    return this.ledger.overshootUsd;
  }

  /**
   * The last call this purse refused, as the current run sees it: the refusal
   * met inside the innermost scope or run of this purse on the current async
   * chain, or, outside any, the last one the purse met. A run clears it as it
   * begins (`./run.ts`), for itself and the scopes around it, never for a run
   * beside it (`./run-frame.ts`).
   */
  get refusal(): AutomationStudioLlmBuildPurseRefusal | undefined {
    const [innermost] = automationStudioLlmBuildPurseFramesOf(this);
    return innermost ? innermost.refusal : this.lastRefusal;
  }

  set refusal(refusal: AutomationStudioLlmBuildPurseRefusal | undefined) {
    for (const frame of automationStudioLlmBuildPurseFramesOf(this)) frame.refusal = refusal;
    this.lastRefusal = refusal;
  }

  /** What the Flow's creation has spent: what earlier builds carried, plus this build's accounting or settled calls, whichever is larger. */
  spentUsd(): number {
    const reported = this.options.spentUsd?.() ?? 0;
    return this.carriedUsd + Math.max(this.ledger.settledUsd(), Number.isFinite(reported) ? reported : 0);
  }

  /** Actual logical provider questions settled by this build, excluding interpretation. */
  spentCalls(): number {
    return this.ledger.calls.spentCalls();
  }

  /** One generation's own held/settled work, never its carried or parent's spend. */
  chargedReceipt(): AutomationStudioLlmBuildPurseCharged {
    return { calls: this.ledger.calls.spentCalls(), chargedCostUsd: this.ledger.settledUsd(), pendingCalls: this.ledger.calls.pendingCalls(), pendingCostUsd: this.ledger.pendingUsd(), unreportedZeroChargeCalls: this.ledger.unreportedZeroChargeCalls };
  }

  /** What calls in flight are held at. */
  pendingUsd(): number {
    return this.ledger.pendingUsd();
  }

  /** What is left of the ceiling once what was spent and what is held are taken out; never below nothing. The judging reserve is not taken out: a judge may spend it. */
  leftUsd(): number {
    return Math.max(0, this.ceilingUsd - this.spentUsd() - this.pendingUsd());
  }

  /** Keep `judging` back from every call that is not a judge's, from now on (t254, `./judging-reserve.ts`). */
  keepBackForJudging(judging: AutomationStudioLlmBuildPurseJudging): void {
    this.judgingReserve.keepBack(judging);
  }

  /**
   * What judging the Flow is held at: the reserve's judge calls, each at the
   * largest judge call priced so far or, before any, at the provider's price
   * for the reserve's standing allowance. `undefined` where nothing is kept
   * back or nothing can be priced.
   */
  judgingHoldUsd(): number | undefined {
    return this.judgingReserve.holdUsd();
  }

  /** What a call that is not a judge's must leave for judging: `judgingHoldUsd`, or nothing. */
  keptBackUsd(): number {
    return this.judgingHoldUsd() ?? 0;
  }

  /**
   * Whether the whole judging kept back can still be held now: its calls
   * beside what is spent and in flight under `maxCalls`, and its hold
   * (`judgingHoldUsd`, where it can be priced) beside what is spent, in
   * flight and still held by open allowances under the ceiling. True when
   * nothing is kept back.
   *
   * The reserve is held only against calls that are not a judge's, so nothing
   * else says when the pair itself stopped fitting. In live run
   * `run-mux6nxst-c9bca37c` (D3-5) a round opened with 47 of 48 calls spent;
   * the reserve judgement's first call said yes, the confirming call was
   * refused, and that one unconfirmed yes finished the build. A caller about to
   * start judging asks this first (`../../flow-bootstrap/unfinished-build/reserve-judging.ts`).
   */
  judgingFits(): boolean {
    if (!this.judgingReserve.isKept()) return true;
    if (!this.ledger.calls.canHoldAll(this.judgingReserve.calls() + this.allowances.outstandingCalls())) return false;
    const holdUsd = this.judgingHoldUsd();
    return holdUsd === undefined || this.spentUsd() + this.pendingUsd() + this.allowances.outstandingUsd() + holdUsd <= this.ceilingUsd + AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD;
  }

  /**
   * Whether `calls` more calls can all still be held beside what is spent and
   * in flight under `maxCalls`; always true without one. What a round needs of
   * the allowance before it is opened: its first decision and, with a judge,
   * the judging pair (`../../flow-bootstrap/unfinished-build/round-funding.ts`).
   */
  callsFit(calls: number): boolean {
    return this.ledger.calls.canHoldAll(calls);
  }

  /**
   * Keep `calls` back from every allowance carved from here on (t570): the
   * calls the build's own finishing needs -- the supervisor's assembly, test
   * and completion, and a reset before the whole test -- which no builder's
   * share may take. Only an allowance asked `fromKeptBack` may carve from them.
   * The purse's own calls are not held to it: the supervisor spends them.
   */
  keepBackCallsFromAllowances(calls: number): void {
    if (!Number.isSafeInteger(calls) || calls < 0) throw new Error("Calls kept back from allowances must be a non-negative safe integer.");
    this.allowanceKeptBackCalls = calls;
  }

  /** What this purse may still call, when it caps its calls: its cap less what is settled and in flight; `undefined` without a cap. */
  unspentCalls(): number | undefined {
    const calls = this.ledger.calls;
    return calls.maxCalls === undefined ? undefined : Math.max(0, calls.maxCalls - calls.spentCalls() - calls.pendingCalls());
  }

  /**
   * The calls an allowance could still be carved with: what is unspent, less
   * the judging reserve's calls, less what open allowances may still call, and
   * -- unless the allowance is for the finishing work -- less the calls kept
   * back from allowances. `undefined` where the purse caps no calls.
   */
  allocatableCalls(options: { fromKeptBack?: boolean } = {}): number | undefined {
    const unspent = this.unspentCalls();
    if (unspent === undefined) return undefined;
    const keptBack = this.judgingReserve.calls() + this.allowances.outstandingCalls() + (options.fromKeptBack ? 0 : this.allowanceKeptBackCalls);
    return Math.max(0, unspent - keptBack);
  }

  /**
   * The calls a call that is not a judge's can still be held for here and in
   * every purse above (t570): what a builder's loop counts its decisions left
   * by (`../evidence-loop/cost-purse.ts`). Each purse's unspent calls, less its
   * judging reserve and what its other open allowances may still call; the
   * fewest of them. `undefined` where no purse in the line caps its calls.
   */
  callsLeft(): number | undefined {
    return this.callsLeftFor(undefined);
  }

  private callsLeftFor(via: AutomationStudioLlmBuildPurse | undefined): number | undefined {
    const unspent = this.unspentCalls();
    const own = unspent === undefined ? undefined : Math.max(0, unspent - this.judgingReserve.calls() - this.allowances.outstandingCalls(via));
    const above = this.parent?.callsLeftFor(this);
    if (own === undefined) return above;
    return above === undefined ? own : Math.min(own, above);
  }

  /** The provider's price, at the rate in force now, for a request of `inputTokens` and a reply of `outputTokens`, all uncached; `undefined` before any call brought a price, or where it prices nonsense. */
  priceUsd(inputTokens: number, outputTokens: number): number | undefined {
    return this.judgingReserve.priceUsd(inputTokens, outputTokens);
  }

  /** What an allowance could still be carved at: the ceiling less what is spent, in flight, kept back for judging and still held by open allowances; never below nothing. */
  allocatableUsd(): number {
    return Math.max(0, this.ceilingUsd - this.spentUsd() - this.pendingUsd() - this.keptBackUsd() - this.allowances.outstandingUsd());
  }

  /**
   * Carve an allowance of `usd` for `briefId`'s `role` (t534): a purse whose
   * calls are held against it and against this purse and every purse above,
   * with its spend attributed to the brief. Refused, in figures, when `usd` is
   * more than `allocatableUsd`, so the judging reserve is never allocatable.
   * One open allowance per brief (`./allowance-book.ts`).
   */
  allowance(request: AutomationStudioLlmBuildPurseAllowanceRequest): { ok: true; allowance: AutomationStudioLlmBuildPurse } | { ok: false; refusal: AutomationStudioLlmBuildPurseAllowanceRefusal } {
    if (this.closed) throw new Error("A closed allowance cannot carve another.");
    const refusal = this.allowances.carvingRefusal(request, this);
    if (refusal) return { ok: false, refusal };
    const allowance = new AutomationStudioLlmBuildPurse(
      { ceilingUsd: request.usd, ...(request.maxCalls !== undefined ? { maxCalls: request.maxCalls } : {}) },
      { parent: this, attribution: { role: request.role, briefId: request.briefId } }
    );
    this.allowances.add(allowance);
    return { ok: true, allowance };
  }

  /** Close this allowance: it holds no further call, calls in flight still settle, and what it left goes back to the purse it was carved from. */
  close(): void {
    if (!this.parent) throw new Error("Only an allowance can be closed.");
    this.closed = true;
    this.parent.allowances.close(this);
  }

  isClosed(): boolean {
    return this.closed;
  }

  /** What each allowance carved from this purse, and from those, has spent, by role and brief. */
  attributedSpend(): AutomationStudioLlmBuildPurseAttributedSpend[] {
    return this.allowances.spend();
  }

  /**
   * Hold a call's worst case, or refuse it. `projectedCostUsd` is the call's
   * worst case (`./projected-cost.ts`); `undefined` means the provider does not
   * price, and the call is held at the most any call here has reported costing,
   * or refused only once nothing is left while none has. A call that is not a
   * judge's must also leave what is kept back for judging (`keptBackUsd`). On an
   * allowance the call is then held against each purse above, and a refusal
   * there is this allowance's too. A judge's call inside a scope that names a
   * backstop (`./judge-backstop.ts`, t685) this purse cannot pay is held
   * against the backstop on its own instead, and the refusal met first is put
   * back when the backstop pays; when neither can, the backstop's refusal is the
   * answer.
   */
  hold(call: AutomationStudioLlmBuildPurseCall): AutomationStudioLlmBuildPurseHeld {
    const backstop = call.judge ? automationStudioLlmBuildPurseJudgeBackstopOf(this) : undefined;
    if (!backstop || backstop === this) return this.holdFor(call, undefined);
    const before: Array<[AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseRefusal | undefined]> = [];
    for (let owner: AutomationStudioLlmBuildPurse | undefined = this; owner; owner = owner.parent) before.push([owner, owner.refusal]);
    const own = this.holdFor(call, undefined);
    if (own.ok) return own;
    const backed = backstop.holdFor(call, undefined);
    if (!backed.ok) return backed;
    // The backstop paid, so the refusal met first refused no call.
    for (const [owner, was] of before) owner.refusal = was;
    return backed;
  }

  /** Hold `call`, made under `via` when it is one of this purse's allowances: what the other open allowances still hold is left alone, `via`'s own is not. */
  private holdFor(call: AutomationStudioLlmBuildPurseCall, via: AutomationStudioLlmBuildPurse | undefined): AutomationStudioLlmBuildPurseHeld {
    this.judgingReserve.note(call);
    const spentUsd = this.spentUsd();
    const pendingUsd = this.pendingUsd();
    const projected = call.projectedCostUsd;
    if (projected !== undefined) this.lastProjectedCostUsd = projected;
    const calls = this.ledger.calls;
    const keptBackCalls = call.judge ? 0 : this.judgingReserve.calls();
    // What the other open allowances may still call is theirs, as their dollars are (t570).
    const allottedCalls = this.allowances.outstandingCalls(via);
    if (!this.closed && !calls.canHold(keptBackCalls + allottedCalls)) {
      const allowance = this.attribution ? { allowance: { ...this.attribution } } : {};
      return this.refuse({ code: "llm_budget.run_call_limit", maxCalls: calls.maxCalls!, spentCalls: calls.spentCalls(), pendingCalls: calls.pendingCalls(), keptBackCalls, ...(allottedCalls > 0 ? { allottedCalls } : {}), ...allowance });
    }
    const keptBackUsd = call.judge ? 0 : this.keptBackUsd();
    const allottedUsd = this.allowances.outstandingUsd(via);
    const heldUsd = projected ?? this.ledger.largestReportedUsd();
    const overBy = () => spentUsd + pendingUsd + keptBackUsd + allottedUsd + heldUsd - this.ceilingUsd;
    let over = heldUsd > 0 ? overBy() > AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD : spentUsd + pendingUsd + keptBackUsd + allottedUsd >= this.ceilingUsd;
    // An allowance short of its next call asks the purse it was carved from for the difference before it refuses (t627).
    const grant = over && !this.closed && heldUsd > 0 ? this.parent?.topUp(this, overBy(), heldUsd) : undefined;
    if (grant) over = overBy() > AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD;
    if (this.closed || over) {
      if (grant) this.topUps.withdraw(grant);
      return this.refuse(automationStudioLlmBuildPurseCostRefusal({
        projectedCostUsd: projected,
        estimatedInputTokens: call.estimatedInputTokens,
        maxOutputTokens: call.maxOutputTokens,
        spentUsd,
        pendingUsd,
        ceilingUsd: this.ceilingUsd,
        carriedUsd: this.carriedUsd,
        keptBackUsd,
        allottedUsd,
        attribution: this.attribution,
        closed: this.closed
      }));
    }
    const above = this.parent?.holdFor(call, this);
    if (above && !above.ok) {
      // A grant for a call a purse above then refused paid for nothing, so it is not kept.
      if (grant) this.topUps.withdraw(grant);
      return this.refuse(above.refusal);
    }
    const own = this.ledger.hold(heldUsd, projected);
    return {
      ok: true,
      hold: {
        settle: (usage) => {
          own.settle(usage);
          if (above) above.hold.settle(usage);
        },
        release: () => {
          own.release();
          if (above) above.hold.release();
        }
      }
    };
  }

  /** Top up `allowance`, one of this purse's, whose next call held at `heldUsd` is `shortfallUsd` short, from what this purse could carve beyond its own finishing (`./top-up.ts`); the grant, if any. */
  private topUp(allowance: AutomationStudioLlmBuildPurse, shortfallUsd: number, heldUsd: number): AutomationStudioLlmBuildPurseTopUp | undefined {
    if (this.closed) return undefined;
    const settledCalls = this.ledger.calls.spentCalls();
    const averageUsd = settledCalls > 0 ? this.ledger.settledUsd() / settledCalls : undefined;
    const finishing = { calls: this.allowanceKeptBackCalls, worstUsd: Math.max(heldUsd, this.lastProjectedCostUsd ?? 0), averageUsd };
    return allowance.topUps.grant({ shortfallUsd, heldUsd, allocatableUsd: this.allocatableUsd(), finishing });
  }

  private refuse(refusal: AutomationStudioLlmBuildPurseRefusal): { ok: false; refusal: AutomationStudioLlmBuildPurseRefusal } {
    this.refusal = refusal;
    return { ok: false, refusal };
  }
}
