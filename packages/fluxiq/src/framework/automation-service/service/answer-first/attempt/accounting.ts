// What an attempt spent, as a build's answer and a saved draft carry it.

import { randomUUID } from "node:crypto";
import { sanitizedBootstrapAccounting, type AutomationStudioBootstrapAccounting } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

export function automationStudioAnswerFirstAccounting(run: AutomationStudioAnswerFirstAttemptRun): AutomationStudioBootstrapAccounting {
  const { provider, authority, creation } = run.input;
  return sanitizedBootstrapAccounting({
    requestId: `attempt.${randomUUID()}`,
    estimatedInputTokens: run.usage.estimatedInputTokens + authority.usage.estimatedInputTokens,
    provider: provider.provider.metadata.provider,
    model: provider.provider.metadata.model,
    inputTokens: run.usage.inputTokens + authority.usage.inputTokens,
    outputTokens: run.usage.outputTokens + authority.usage.outputTokens,
    totalTokens: run.usage.totalTokens + authority.usage.totalTokens,
    estimatedCostUsd: creation.purse.spentUsd()
  });
}
