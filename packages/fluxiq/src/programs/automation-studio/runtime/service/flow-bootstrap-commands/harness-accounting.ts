import { sanitizedBootstrapAccounting, type AutomationStudioBootstrapAccounting } from "../../flow-bootstrap/index.ts";

// What one Flow Bootstrap harness call cost, with what reading the instruction
// cost beside it.
//
// The two are billed together because they are one build. The instruction's
// authority is derived at most once, on the first step that declares a lasting
// consequence, and it is a provider call like any other: left out, a build that
// asked a person for permission reported less spend than it made.

/** The usage an instruction-authority derivation accumulated, zero when it never ran. */
export type AutomationStudioBootstrapAuthorityUsage = {
  estimatedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

/** One harness result as the accounting a Bootstrap adaptation stores. */
export function bootstrapHarnessAccounting(
  result: {
    request: { requestId: string; estimatedInputTokens: number };
    provider?: { provider?: string; model?: string } | undefined;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number } | undefined;
  },
  authority: AutomationStudioBootstrapAuthorityUsage
): AutomationStudioBootstrapAccounting {
  return sanitizedBootstrapAccounting({
    requestId: result.request.requestId,
    estimatedInputTokens: result.request.estimatedInputTokens + authority.estimatedInputTokens,
    ...(result.provider?.provider ? { provider: result.provider.provider } : {}),
    ...(result.provider?.model ? { model: result.provider.model } : {}),
    inputTokens: (result.usage?.inputTokens ?? 0) + authority.inputTokens,
    outputTokens: (result.usage?.outputTokens ?? 0) + authority.outputTokens,
    totalTokens: (result.usage?.totalTokens ?? 0) + authority.totalTokens,
    estimatedCostUsd: (result.usage?.estimatedCostUsd ?? 0) + authority.estimatedCostUsd
  });
}
