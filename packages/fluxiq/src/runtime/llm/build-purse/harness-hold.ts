import { automationStudioLlmBuildPurseHoldCall as holdCall, type AutomationStudioLlmBuildPurseRefusal } from "../../agents/budget/index.ts";
import type { AutomationStudioLlmDiagnostic } from "../../models/limits/index.ts";

/** Studio retains its exact user-facing refusal wording; the framework owns multi-scope reservation and settlement. */
export function automationStudioLlmBuildPurseHoldCall(input: Omit<Parameters<typeof holdCall>[0], "diagnostic">): ReturnType<typeof holdCall> {
  return holdCall({ ...input, diagnostic: (refusal, scope) => refusalDiagnostic(refusal, scope === "active" ? "build" : "Flow") });
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
