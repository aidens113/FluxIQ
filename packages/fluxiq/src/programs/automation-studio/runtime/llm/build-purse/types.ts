// The purse's contracts, shared across this directory: what a call asks of it,
// what holding one gives back, why one was refused, and how a purse is opened
// (`./purse.ts`).

import type { AutomationStudioLlmUsageSummary } from "../harness/index.ts";
import type { AutomationStudioLlmBuildPurseAttribution } from "./allowance-book.ts";

/** This purse's own canonical charges, excluding carried spend and external aggregate accounting. */
export type AutomationStudioLlmBuildPurseCharged = {
  calls: number;
  chargedCostUsd: number;
  pendingCalls: number;
  pendingCostUsd: number;
  unreportedZeroChargeCalls: number;
};

/** Why a call was not sent, in figures. */
export type AutomationStudioLlmBuildPurseRefusal = {
  code: "llm_budget.run_call_limit";
  maxCalls: number; spentCalls: number; pendingCalls: number; keptBackCalls: number;
  /** What open allowances other than the call's own may still call, which the call had to leave (t570). Absent when none may. */
  allottedCalls?: number;
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

/** The outcome of asking a purse to hold a call. */
export type AutomationStudioLlmBuildPurseHeld = { ok: true; hold: AutomationStudioLlmBuildPurseHold } | { ok: false; refusal: AutomationStudioLlmBuildPurseRefusal };
