import type { ModelProvider } from "../../models/contracts/index.ts";
import type { AutomationStudioLlmDiagnostic } from "../../models/limits/index.ts";
import { automationStudioLlmCurrentFlowPurse } from "./flow-scope.ts";
import { automationStudioLlmProjectedCallCostUsd } from "./projected-cost.ts";
import type { AutomationStudioLlmBuildPurse } from "./purse.ts";
import { automationStudioLlmCurrentBuildPurse } from "./run.ts";
import type { AutomationStudioLlmBuildPurseHold, AutomationStudioLlmBuildPurseRefusal } from "./types.ts";

type HoldInput = {
  provider: Pick<ModelProvider, "estimateCostUsd">;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  judge?: boolean | undefined;
  diagnostic?: (refusal: AutomationStudioLlmBuildPurseRefusal, scope: "active" | "owner") => AutomationStudioLlmDiagnostic;
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
  if (builds && !builds.ok) return { ok: false, diagnostic: (input.diagnostic ?? refusalDiagnostic)(builds.refusal, "active") };
  const flows = flow && !carvedFrom(build, flow) ? holdOn(flow, input) : undefined;
  if (flows && !flows.ok) {
    builds?.hold.release();
    // The build ends on cost, as on its own ceiling: its run reads its purse's refusal.
    if (build) build.refusal = flows.refusal;
    return { ok: false, diagnostic: (input.diagnostic ?? refusalDiagnostic)(flows.refusal, "owner") };
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

/** Whether `flow` is `build` or a purse `build` was carved from, and so already held. */
function carvedFrom(build: AutomationStudioLlmBuildPurse | undefined, flow: AutomationStudioLlmBuildPurse): boolean {
  for (let purse = build; purse; purse = purse.parent) {
    if (purse === flow) return true;
  }
  return false;
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
function refusalDiagnostic(refusal: AutomationStudioLlmBuildPurseRefusal, scope: "active" | "owner"): AutomationStudioLlmDiagnostic {
  return { severity: "error", code: refusal.code, message: `The ${scope} model budget cannot admit this call. It was not sent.`, metadata: { ...refusal, ...(scope === "owner" ? { purse: "flow" } : {}) } };
}
