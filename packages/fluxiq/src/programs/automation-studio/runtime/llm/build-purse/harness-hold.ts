// The harness's side of the purse: price the request about to be sent and hold
// it, or say in figures why it was not sent.

import type { AutomationStudioLlmDiagnostic, AutomationStudioLlmProvider } from "../harness/index.ts";
import { automationStudioLlmProjectedCallCostUsd } from "./projected-cost.ts";
import type { AutomationStudioLlmBuildPurseHold } from "./purse.ts";
import { automationStudioLlmCurrentBuildPurse } from "./run.ts";

/**
 * Hold this request against the build's purse, when the call is made under
 * one. `estimatedInputTokens` is the harness's price measure of the request:
 * the messages the provider will send, never the packed request
 * (`../harness/run.ts`, `measuredInput`); `maxOutputTokens` is what its reply
 * is held at, a reserve and never a cap (`./build-call-reserves.ts`). `judge` marks a judge's
 * call, which draws on the judging reserve rather than leaving it
 * (`./purse.ts`). `undefined` when there is no purse.
 */
export function automationStudioLlmBuildPurseHoldCall(input: {
  provider: Pick<AutomationStudioLlmProvider, "estimateCostUsd">;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  judge?: boolean | undefined;
}): { ok: true; hold: AutomationStudioLlmBuildPurseHold } | { ok: false; diagnostic: AutomationStudioLlmDiagnostic } | undefined {
  const purse = automationStudioLlmCurrentBuildPurse();
  if (!purse) return undefined;
  const { provider } = input;
  const projectedCostUsd = automationStudioLlmProjectedCallCostUsd(provider, input.estimatedInputTokens, input.maxOutputTokens);
  const held = purse.hold({
    projectedCostUsd,
    estimatedInputTokens: input.estimatedInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    ...(input.judge ? { judge: true } : {}),
    // The provider's price, so the purse can size the judging reserve before a judge has been priced.
    price: (inputTokens, outputTokens) => automationStudioLlmProjectedCallCostUsd(provider, inputTokens, outputTokens)
  });
  if (held.ok) return held;
  const { refusal } = held;
  const cost = refusal.projectedCostUsd !== undefined
    ? ` and this request (${refusal.estimatedInputTokens} input tokens, ${refusal.maxOutputTokens} for the reply) would cost up to ${usd(refusal.projectedCostUsd)}`
    : "";
  const keptBack = refusal.keptBackUsd !== undefined ? `, ${usd(refusal.keptBackUsd)} is kept back for judging the Flow` : "";
  return {
    ok: false,
    diagnostic: {
      severity: "error",
      code: refusal.code,
      message: `The build's spending limit of ${usd(refusal.ceilingUsd)} cannot pay for this call: ${usd(refusal.spentUsd)} is spent, ${usd(refusal.pendingUsd)} is held for calls in flight${keptBack}${cost}. It was not sent.`,
      metadata: { ...refusal }
    }
  };
}

function usd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
