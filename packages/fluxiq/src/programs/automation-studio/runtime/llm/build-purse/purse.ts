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
// **A reply is held at a reserve, not a cap (user, 2026-10-03, t254).** No
// request sends `max_tokens`, so a call's hold is its sent input all uncached,
// at the rate in force when it is held, plus the largest reply observed for its
// kind with a margin (`./build-call-reserves.ts`). The hold is no longer a
// proof: a reply longer than its reserve costs more than it was held at, and the
// Flow's ceiling can be crossed -- only by the part of that one reply beyond its
// reservation, since calls are held one at a time and nothing fits once one has
// overshot. Each such call is a breach, its overshoot added to `overshootUsd`,
// and both reach the loop's accounting (`../evidence-loop/cost-purse.ts`). What
// a settled call is charged is what the provider billed: its cached input at
// the cached rate and off-peak calls at half (`../deepseek/pricing.ts`).
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
// **Judging is kept back while a build explores (t254).** A build with a judge
// ends every round by judging its Flow, a pair of calls (a first answer, then a
// second that confirms a yes or asks a non-yes again). `run-murzln6g` spent
// $0.089 of $0.10 over thirty exploration decisions and reached its judgement
// with nothing left for a repair. So once the build's phases ask for it
// (`keepBackForJudging`), every call that is not a judge's -- each decision,
// the instruction reading -- is held as if the judging pair were already in
// flight: refused when what is spent, what is in flight, the judging pair and
// its own worst case would cross the ceiling. A judge's call draws on that
// reserve rather than leaving it. The pair is held at the largest judge call
// priced so far, or, before any has been, at the provider's price for the
// standing judge allowance the phases name. The reserve is never charged:
// spend is still only what calls settle at, so it shows in no accounting, only
// in what the loop is told is left (`../loop-budget.ts`) and in a refusal's
// `keptBackUsd`.
//
// **Allowances: a chain of purses (t534).** The project supervisor gives each
// brief its own allowance carved from the build's purse (`allowance`). An
// allowance is a purse whose parent is the purse it was carved from: every call
// made under it is held against it and against each purse above it, and either
// refusing refuses the call. It can only be carved from what the parent has
// left less its judging reserve and less what open allowances still hold, and
// while open, what it has not spent is kept from every other call on the parent
// (`./allowance-book.ts`). Its refusal is its own, and so is the refusal of each
// run made under it (`./run-frame.ts`), so concurrent builders end on their own
// money, never on a sibling's.

import { AutomationStudioLlmBuildCallAllowance } from "./call-allowance.ts";
import { AutomationStudioLlmBuildPurseAllowanceBook, type AutomationStudioLlmBuildPurseAllowanceRefusal, type AutomationStudioLlmBuildPurseAllowanceRequest, type AutomationStudioLlmBuildPurseAttributedSpend, type AutomationStudioLlmBuildPurseAttribution } from "./allowance-book.ts";
import { automationStudioLlmBuildPurseFramesOf } from "./run-frame.ts";
import type { AutomationStudioLlmUsageSummary } from "../harness/index.ts";

/** Why a call was not sent, in figures. */
export type AutomationStudioLlmBuildPurseRefusal = {
  code: "llm_budget.run_call_limit";
  maxCalls: number; spentCalls: number; pendingCalls: number; keptBackCalls: number;
  /** The allowance that refused, when one did: its figures are the allowance's. */
  allowance?: AutomationStudioLlmBuildPurseAttribution;
} | AutomationStudioLlmBuildPurseCostRefusal;

type AutomationStudioLlmBuildPurseCostRefusal = {
  code: "llm_budget.run_cost_limit";
  /** The call's hold: every input token uncached, its reply at its reserve (`./build-call-reserves.ts`). Absent where the provider does not price. */
  projectedCostUsd?: number;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  /** What the build had spent when the call was refused. */
  spentUsd: number;
  /** What calls still in flight were held at. */
  pendingUsd: number;
  ceilingUsd: number;
  /** What earlier builds of the same Flow creation had spent, included in `spentUsd`. Absent when none. */
  carriedUsd?: number;
  /** What was kept back for judging the build's Flow, which this call -- not a judge's -- had to leave (`keepBackForJudging`). Absent when nothing was. */
  keptBackUsd?: number;
  /** What open allowances other than the call's own still held of this purse, which the call had to leave. Absent when none did. */
  allottedUsd?: number;
  /** The allowance that refused, when one did: its figures are the allowance's. */
  allowance?: AutomationStudioLlmBuildPurseAttribution;
  /** The allowance was closed: it holds no further call, whatever it has left. */
  closed?: true;
};

/** A request's worst case by the provider's own price, or `undefined` where it does not price (`./projected-cost.ts`). */
export type AutomationStudioLlmBuildPursePrice = (inputTokens: number, outputTokens: number) => number | undefined;

/** One call the purse is asked to hold. */
export type AutomationStudioLlmBuildPurseCall = {
  /** The call's worst case (`./projected-cost.ts`); `undefined` where the provider does not price. */
  projectedCostUsd: number | undefined;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  /** The call is a judge's: it draws on the judging reserve rather than leaving it, and the reserve is sized from it. */
  judge?: boolean | undefined;
  /** The provider's price, kept so the purse can price the judging reserve and a round's least decision before either is asked for. */
  price?: AutomationStudioLlmBuildPursePrice | undefined;
};

/**
 * Judging the build's Flow, kept back from every other call (t254): `calls`
 * judge calls, each held at the largest judge call priced so far, or at the
 * provider's price for `unpriced` before any has been.
 */
export type AutomationStudioLlmBuildPurseJudging = {
  calls: number;
  unpriced: { inputTokens: number; outputTokens: number };
};

/** One call's hold on the purse, settled once by whichever comes first. */
export type AutomationStudioLlmBuildPurseHold = {
  /** The call was made: charge what it reported, or what it was held at when it reported nothing. */
  settle(usage?: AutomationStudioLlmUsageSummary): void;
  /** The call was never sent: charge nothing. */
  release(): void;
};

export type AutomationStudioLlmBuildPurseOptions = {
  /** The most the build may spend from here. */
  ceilingUsd: number;
  maxCalls?: number;
  /**
   * What the build's own accounting says it has spent, where it keeps one. The
   * purse charges the larger of this and what its own calls settled at, so a
   * call the accounting saw and the purse did not is never forgotten, and one
   * both saw is never charged twice.
   */
  spentUsd?: () => number;
  /**
   * What earlier builds of the same Flow creation already spent from this
   * ceiling (`../../flow-bootstrap/creation-spend/`). One purse covers a Flow's
   * creation -- every build of it, their tests, judges and repairs, until the
   * Flow is proposed or declared not doable -- so building again carries the
   * spend on rather than starting a fresh ceiling.
   */
  carriedUsd?: number;
  /** Told of each call that reported costing more than it was held at. */
  onBreach?: () => void;
  /** Told what each settled call was charged: what it reported, or its hold when it reported nothing. A Flow's purse writes it to the Flow's record (t438). */
  onSettled?: (chargedUsd: number) => void;
};

/** Floating-point slack, so a call that lands exactly on the ceiling is allowed. */
const EPSILON_USD = 1e-9;

type AutomationStudioLlmBuildPurseHeld = { ok: true; hold: AutomationStudioLlmBuildPurseHold } | { ok: false; refusal: AutomationStudioLlmBuildPurseRefusal };

/** What ties an allowance to the purse it was carved from. Set only by `allowance`. */
type AutomationStudioLlmBuildPurseLink = {
  parent: AutomationStudioLlmBuildPurse;
  attribution: AutomationStudioLlmBuildPurseAttribution;
};

export class AutomationStudioLlmBuildPurse {
  readonly ceilingUsd: number;
  /** Calls that reported costing more than they were held at. */
  breaches = 0;
  /** What those calls cost beyond their holds, summed: by how much the purse's holds were short, which is how far past its ceiling it can have gone. */
  overshootUsd = 0;
  /** The worst case of the last call it priced: the least the next, larger request can cost at worst. */
  lastProjectedCostUsd: number | undefined;
  /** What earlier builds of the same Flow creation spent: part of `spentUsd`, never charged again. */
  readonly carriedUsd: number;
  /** The purse this allowance was carved from; absent on a build's or a Flow's own purse. */
  readonly parent: AutomationStudioLlmBuildPurse | undefined;
  /** The role and brief this allowance was carved for; absent on a build's or a Flow's own purse. */
  readonly attribution: AutomationStudioLlmBuildPurseAttribution | undefined;
  private settledUsd = 0;
  private readonly callAllowance: AutomationStudioLlmBuildCallAllowance;
  /** The most any call settled on this purse reported costing: what an unpriced call is held at. */
  private largestReportedUsd = 0;
  private readonly pending = new Map<number, number>();
  private holds = 0;
  /** Judging kept back from every other call, once the build's phases ask for it. */
  private judging: AutomationStudioLlmBuildPurseJudging | undefined;
  /** The largest worst case of a judge call priced on this purse: what each judge call of the reserve is held at. */
  private largestJudgeHoldUsd: number | undefined;
  /** The provider's price, from the last call that brought one. */
  private price: AutomationStudioLlmBuildPursePrice | undefined;
  /** The last refusal, for a reader outside any scope or run of this purse (`./run-frame.ts`). */
  private lastRefusal: AutomationStudioLlmBuildPurseRefusal | undefined;
  /** Allowances carved from this purse. */
  private readonly allowances = new AutomationStudioLlmBuildPurseAllowanceBook();
  private closed = false;

  constructor(private readonly options: AutomationStudioLlmBuildPurseOptions, link?: AutomationStudioLlmBuildPurseLink) {
    if (!Number.isFinite(options.ceilingUsd) || options.ceilingUsd < 0) throw new Error("A build purse's ceiling must be a finite, non-negative amount.");
    const carried = options.carriedUsd ?? 0;
    if (!Number.isFinite(carried) || carried < 0) throw new Error("A build purse's carried spend must be a finite, non-negative amount.");
    this.callAllowance = new AutomationStudioLlmBuildCallAllowance(options.maxCalls);
    this.ceilingUsd = options.ceilingUsd;
    this.carriedUsd = carried;
    this.parent = link?.parent;
    this.attribution = link ? { ...link.attribution } : undefined;
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
    return this.carriedUsd + Math.max(this.settledUsd, Number.isFinite(reported) ? reported : 0);
  }

  /** Actual logical provider questions settled by this build, excluding interpretation. */
  spentCalls(): number { return this.callAllowance.spentCalls(); }

  /** What calls in flight are held at. */
  pendingUsd(): number {
    return [...this.pending.values()].reduce((sum, held) => sum + held, 0);
  }

  /** What is left of the ceiling once what was spent and what is held are taken out; never below nothing. The judging reserve is not taken out: a judge may spend it. */
  leftUsd(): number {
    return Math.max(0, this.ceilingUsd - this.spentUsd() - this.pendingUsd());
  }

  /** Keep `judging` back from every call that is not a judge's, from now on (t254). */
  keepBackForJudging(judging: AutomationStudioLlmBuildPurseJudging): void {
    this.judging = { calls: judging.calls, unpriced: { ...judging.unpriced } };
  }

  /**
   * What judging the Flow is held at: the reserve's judge calls, each at the
   * largest judge call priced so far or, before any, at the provider's price
   * for the reserve's standing allowance. `undefined` where nothing is kept
   * back or nothing can be priced.
   */
  judgingHoldUsd(): number | undefined {
    if (!this.judging) return undefined;
    const each = this.largestJudgeHoldUsd ?? this.priceUsd(this.judging.unpriced.inputTokens, this.judging.unpriced.outputTokens);
    return each === undefined ? undefined : this.judging.calls * each;
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
    if (!this.judging) return true;
    if (!this.callAllowance.canHoldAll(this.judging.calls)) return false;
    const holdUsd = this.judgingHoldUsd();
    return holdUsd === undefined || this.spentUsd() + this.pendingUsd() + this.allowances.outstandingUsd() + holdUsd <= this.ceilingUsd + EPSILON_USD;
  }

  /**
   * Whether `calls` more calls can all still be held beside what is spent and
   * in flight under `maxCalls`; always true without one. What a round needs of
   * the allowance before it is opened: its first decision and, with a judge,
   * the judging pair (`../../flow-bootstrap/unfinished-build/round-funding.ts`).
   */
  callsFit(calls: number): boolean {
    return this.callAllowance.canHoldAll(calls);
  }

  /** The provider's price, at the rate in force now, for a request of `inputTokens` and a reply of `outputTokens`, all uncached; `undefined` before any call brought a price, or where it prices nonsense. */
  priceUsd(inputTokens: number, outputTokens: number): number | undefined {
    let priced: number | undefined;
    try {
      priced = this.price?.(inputTokens, outputTokens);
    } catch {
      priced = undefined;
    }
    return typeof priced === "number" && Number.isFinite(priced) && priced > 0 ? priced : undefined;
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
   * One open allowance per brief.
   */
  allowance(request: AutomationStudioLlmBuildPurseAllowanceRequest): { ok: true; allowance: AutomationStudioLlmBuildPurse } | { ok: false; refusal: AutomationStudioLlmBuildPurseAllowanceRefusal } {
    if (this.closed) throw new Error("A closed allowance cannot carve another.");
    if (!request.briefId || !request.role) throw new Error("An allowance must name the brief and the role it is carved for.");
    if (!Number.isFinite(request.usd) || request.usd < 0) throw new Error("An allowance must be a finite, non-negative amount.");
    if (this.allowances.hasOpen(request.briefId)) throw new Error(`An allowance for brief ${request.briefId} is already open.`);
    const allocatableUsd = this.allocatableUsd();
    if (request.usd > allocatableUsd + EPSILON_USD) {
      return { ok: false, refusal: { code: "llm_budget.allowance_unavailable", requestedUsd: request.usd, allocatableUsd, keptBackUsd: this.keptBackUsd(), outstandingUsd: this.allowances.outstandingUsd() } };
    }
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

  isClosed(): boolean { return this.closed; }

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
   * there is this allowance's too.
   */
  hold(call: AutomationStudioLlmBuildPurseCall): AutomationStudioLlmBuildPurseHeld {
    return this.holdFor(call, undefined);
  }

  /** Hold `call`, made under `via` when it is one of this purse's allowances: what the other open allowances still hold is left alone, `via`'s own is not. */
  private holdFor(call: AutomationStudioLlmBuildPurseCall, via: AutomationStudioLlmBuildPurse | undefined): AutomationStudioLlmBuildPurseHeld {
    if (call.price) this.price = call.price;
    const spentUsd = this.spentUsd();
    const pendingUsd = this.pendingUsd();
    const projected = call.projectedCostUsd;
    if (projected !== undefined) this.lastProjectedCostUsd = projected;
    if (call.judge && projected !== undefined) this.largestJudgeHoldUsd = Math.max(this.largestJudgeHoldUsd ?? 0, projected);
    const allowance = this.attribution ? { allowance: { ...this.attribution } } : {};
    const keptBackCalls = call.judge ? 0 : (this.judging?.calls ?? 0);
    if (!this.closed && !this.callAllowance.canHold(keptBackCalls)) {
      return this.refuse({ code: "llm_budget.run_call_limit", maxCalls: this.callAllowance.maxCalls!, spentCalls: this.callAllowance.spentCalls(), pendingCalls: this.callAllowance.pendingCalls(), keptBackCalls, ...allowance });
    }
    const keptBackUsd = call.judge ? 0 : this.keptBackUsd();
    const allottedUsd = this.allowances.outstandingUsd(via);
    const heldUsd = projected ?? this.largestReportedUsd;
    const over = heldUsd > 0
      ? spentUsd + pendingUsd + keptBackUsd + allottedUsd + heldUsd > this.ceilingUsd + EPSILON_USD
      : spentUsd + pendingUsd + keptBackUsd + allottedUsd >= this.ceilingUsd;
    if (this.closed || over) {
      return this.refuse({
        code: "llm_budget.run_cost_limit",
        ...(projected !== undefined ? { projectedCostUsd: projected } : {}),
        estimatedInputTokens: call.estimatedInputTokens,
        maxOutputTokens: call.maxOutputTokens,
        spentUsd,
        pendingUsd,
        ceilingUsd: this.ceilingUsd,
        ...(this.carriedUsd > 0 ? { carriedUsd: this.carriedUsd } : {}),
        ...(keptBackUsd > 0 ? { keptBackUsd } : {}),
        ...(allottedUsd > 0 ? { allottedUsd } : {}),
        ...allowance,
        ...(this.closed ? { closed: true as const } : {})
      });
    }
    const above = this.parent?.holdFor(call, this);
    if (above && !above.ok) return this.refuse(above.refusal);
    const own = this.holdOwn(heldUsd, projected);
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

  private refuse(refusal: AutomationStudioLlmBuildPurseRefusal): { ok: false; refusal: AutomationStudioLlmBuildPurseRefusal } {
    this.refusal = refusal;
    return { ok: false, refusal };
  }

  /** Put `heldUsd` in flight on this purse alone, settled once by whichever comes first. */
  private holdOwn(heldUsd: number, projected: number | undefined): AutomationStudioLlmBuildPurseHold {
    const callHold = this.callAllowance.hold();
    const id = this.holds += 1;
    this.pending.set(id, heldUsd);
    let settled = false;
    return {
      settle: (usage) => {
        if (settled) return;
        settled = true;
        this.pending.delete(id);
        callHold.settle();
        const reported = usage?.estimatedCostUsd;
        const valid = typeof reported === "number" && Number.isFinite(reported) && reported >= 0;
        const chargedUsd = valid ? reported : heldUsd;
        this.settledUsd += chargedUsd;
        this.options.onSettled?.(chargedUsd);
        if (valid) this.largestReportedUsd = Math.max(this.largestReportedUsd, reported);
        if (valid && projected !== undefined && reported > heldUsd + EPSILON_USD) {
          this.breaches += 1;
          this.overshootUsd += reported - heldUsd;
          this.options.onBreach?.();
        }
      },
      release: () => {
        if (settled) return;
        settled = true;
        this.pending.delete(id);
        callHold.release();
      }
    };
  }
}
