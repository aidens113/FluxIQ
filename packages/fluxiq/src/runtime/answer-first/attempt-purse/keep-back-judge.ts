// Keeps one Flow-less judge call payable however the decisions spent the purse.
//
// The judging reserve (`runtime/agents/budget/judging-reserve.ts`) holds each
// judge call at the largest *judge* call priced so far, never at a decision, so
// it does not under-hold as the decisions' context grows. Before any judge has
// been priced it holds the provider's price for the unpriced figures given here,
// and those do not grow: so a caller whose summary is bigger (many rows) passes
// `summaryInputTokens` and the reserve is sized from the larger.

import { AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES, type AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";

export function automationStudioAnswerFirstKeepBackJudge(purse: Pick<AutomationStudioLlmBuildPurse, "keepBackForJudging">, options: { calls?: number; summaryInputTokens?: number } = {}): void {
  const inputTokens = Math.max(AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeInputTokens, Math.ceil(options.summaryInputTokens ?? 0));
  purse.keepBackForJudging({ calls: Math.max(1, options.calls ?? 1), unpriced: { inputTokens, outputTokens: AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeReplyTokens } });
}
