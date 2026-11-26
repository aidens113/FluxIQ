import { automationStudioLlmBuildPurseHoldCall as holdCall, type AutomationStudioLlmBuildPurseRefusal } from "../../agents/budget/index.ts";
import type { AutomationStudioLlmDiagnostic } from "../../models/limits/index.ts";
import { automationStudioLlmBuildPurseObservedCost as observedCost } from "./observed-cost.ts";
import { automationStudioLlmBuildPursePriced } from "./priced.ts";

/**
 * Studio retains its exact user-facing refusal wording; the framework owns multi-scope reservation and settlement. A
 * provider that prices no call is held as priced at Core's default model, never as free, and never below what such calls
 * on the purse were seen to cost (`./priced.ts`, t1056): what each settled call reported is noted for that.
 */
export function automationStudioLlmBuildPurseHoldCall(input: Omit<Parameters<typeof holdCall>[0], "diagnostic">): ReturnType<typeof holdCall> {
  const purses = observedCost.inScope();
  const held = holdCall({
    ...input,
    ...priced(input, purses),
    diagnostic: (refusal, scope) => refusalDiagnostic(refusal, scope === "active" ? "build" : "Flow")
  });
  if (!held?.ok) return held;
  const settle = (usage: Parameters<typeof held.hold.settle>[0]): void => {
    observedCost.note(purses, usage, input.judge === true);
    held.hold.settle(usage);
  };
  return { ok: true, hold: { settle, release: () => held.hold.release() } };
}

/**
 * The call's pricing and its judge's (`./priced.ts`). Where a provider prices nothing, a judge's call, and the judging
 * kept back from every other call, are held at no less than the most a judge's call on the purse reported costing, as
 * the purse holds judging at the largest judge call priced so far (`agents/budget/judging-reserve.ts`); any other call
 * at no less than the most any call reported. The judge's pricing is always handed over, so the reserve is priced as a
 * judge's call is.
 */
function priced(input: Pick<Parameters<typeof holdCall>[0], "provider" | "judgePricing" | "judge">, purses: Parameters<typeof observedCost.of>[0]): Pick<Parameters<typeof holdCall>[0], "provider" | "judgePricing"> {
  const judging = automationStudioLlmBuildPursePriced(input.judgePricing ?? input.provider, () => observedCost.of(purses, "judge"));
  return { provider: input.judge ? judging : automationStudioLlmBuildPursePriced(input.provider, () => observedCost.of(purses, "any")), judgePricing: judging };
}

function refusalDiagnostic(refusal: AutomationStudioLlmBuildPurseRefusal, purseWhose: "build" | "Flow"): AutomationStudioLlmDiagnostic {
  const whose = refusal.allowance ? `allowance for brief ${refusal.allowance.briefId}` : purseWhose;
  if (refusal.code === "llm_budget.run_call_limit") return { severity: "error", code: refusal.code, message: `The ${refusal.allowance ? whose : "build"} limit of ${refusal.maxCalls} logical model calls cannot admit another: ${refusal.spentCalls} sent, ${refusal.pendingCalls} pending, ${refusal.keptBackCalls} kept for judging. It was not sent.`, metadata: { ...refusal } };
  const cost = refusal.projectedCostUsd !== undefined
    ? ` and this request (${refusal.estimatedInputTokens} input tokens, ${refusal.maxOutputTokens} for the reply) would cost up to ${usd(refusal.projectedCostUsd)}`
    : "";
  const keptBack = refusal.keptBackUsd !== undefined ? `, ${usd(refusal.keptBackUsd)} is kept back for judging the Flow` : "";
  const allotted = refusal.allottedUsd !== undefined ? `, ${usd(refusal.allottedUsd)} is promised to other briefs` : "";
  const closed = refusal.closed ? " The allowance is closed." : "";
  return {
    severity: "error",
    code: refusal.code,
    message: `The ${whose}'s spending limit of ${usd(refusal.ceilingUsd)} cannot pay for this call: ${usd(refusal.spentUsd)} is spent, ${usd(refusal.pendingUsd)} is held for calls in flight${keptBack}${allotted}${cost}.${closed} It was not sent.`,
    metadata: { ...refusal, ...(purseWhose === "Flow" ? { purse: "flow" } : {}) }
  };
}

function usd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
