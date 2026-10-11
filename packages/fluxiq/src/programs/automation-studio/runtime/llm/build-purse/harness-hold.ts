// The harness's side of the purse: price the request about to be sent and hold
// it, or say in figures why it was not sent.
//
// A call is held against the build's purse when it is made under one, and
// against the Flow's purse when it is made in a Lab-scoped run (t438,
// `./flow-scope.ts`): both, when both are current. Either refusing refuses the
// call, and the other's hold is let go. A refusal by the Flow's purse is also
// set on the build's purse, so a build ends on cost through the same path it
// ends on its own ceiling (`./run.ts`).

import type { AutomationStudioLlmDiagnostic, AutomationStudioLlmProvider } from "../harness/index.ts";
import { automationStudioLlmCurrentFlowPurse } from "./flow-scope.ts";
import { automationStudioLlmProjectedCallCostUsd } from "./projected-cost.ts";
import type { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseHold, AutomationStudioLlmBuildPurseRefusal } from "./purse.ts";
import { automationStudioLlmCurrentBuildPurse } from "./run.ts";

type HoldInput = {
  provider: Pick<AutomationStudioLlmProvider, "estimateCostUsd">;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  judge?: boolean | undefined;
};

/**
 * Hold this request against the build's purse and the Flow's, whichever the
 * call is made under. `estimatedInputTokens` is the harness's price measure of the request:
 * the messages the provider will send, never the packed request
 * (`../harness/run.ts`, `measuredInput`); `maxOutputTokens` is what its reply
 * is held at, a reserve and never a cap (`./build-call-reserves.ts`). `judge` marks a judge's
 * call, which draws on the judging reserve rather than leaving it
 * (`./purse.ts`). `undefined` when there is neither purse.
 */
export function automationStudioLlmBuildPurseHoldCall(input: HoldInput): { ok: true; hold: AutomationStudioLlmBuildPurseHold } | { ok: false; diagnostic: AutomationStudioLlmDiagnostic } | undefined {
  const build = automationStudioLlmCurrentBuildPurse();
  const flow = automationStudioLlmCurrentFlowPurse();
  if (!build && !flow) return undefined;
  const builds = build ? holdOn(build, input) : undefined;
  if (builds && !builds.ok) return { ok: false, diagnostic: refusalDiagnostic(builds.refusal, "build") };
  const flows = flow && flow !== build ? holdOn(flow, input) : undefined;
  if (flows && !flows.ok) {
    builds?.hold.release();
    // The build ends on cost, as on its own ceiling: its run reads its purse's refusal.
    if (build) build.refusal = flows.refusal;
    return { ok: false, diagnostic: refusalDiagnostic(flows.refusal, "Flow") };
  }
  const holds = [builds?.hold, flows?.hold].filter((hold): hold is AutomationStudioLlmBuildPurseHold => hold !== undefined);
  return {
    ok: true,
    hold: {
      settle: (usage) => {
        for (const hold of holds) hold.settle(usage);
      },
      release: () => {
        for (const hold of holds) hold.release();
      }
    }
  };
}

function holdOn(purse: AutomationStudioLlmBuildPurse, input: HoldInput): ReturnType<AutomationStudioLlmBuildPurse["hold"]> {
  const { provider } = input;
  return purse.hold({
    projectedCostUsd: automationStudioLlmProjectedCallCostUsd(provider, input.estimatedInputTokens, input.maxOutputTokens),
    estimatedInputTokens: input.estimatedInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    ...(input.judge ? { judge: true } : {}),
    // The provider's price, so the purse can size the judging reserve before a judge has been priced.
    price: (inputTokens, outputTokens) => automationStudioLlmProjectedCallCostUsd(provider, inputTokens, outputTokens)
  });
}

function refusalDiagnostic(refusal: AutomationStudioLlmBuildPurseRefusal, whose: "build" | "Flow"): AutomationStudioLlmDiagnostic {
  if (refusal.code === "llm_budget.run_call_limit") return { severity: "error", code: refusal.code, message: `The build limit of ${refusal.maxCalls} logical model calls cannot admit another: ${refusal.spentCalls} sent, ${refusal.pendingCalls} pending, ${refusal.keptBackCalls} kept for judging. It was not sent.`, metadata: { ...refusal } };
  const cost = refusal.projectedCostUsd !== undefined
    ? ` and this request (${refusal.estimatedInputTokens} input tokens, ${refusal.maxOutputTokens} for the reply) would cost up to ${usd(refusal.projectedCostUsd)}`
    : "";
  const keptBack = refusal.keptBackUsd !== undefined ? `, ${usd(refusal.keptBackUsd)} is kept back for judging the Flow` : "";
  return {
    severity: "error",
    code: refusal.code,
    message: `The ${whose}'s spending limit of ${usd(refusal.ceilingUsd)} cannot pay for this call: ${usd(refusal.spentUsd)} is spent, ${usd(refusal.pendingUsd)} is held for calls in flight${keptBack}${cost}. It was not sent.`,
    metadata: { ...refusal, ...(whose === "Flow" ? { purse: "flow" } : {}) }
  };
}

function usd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
