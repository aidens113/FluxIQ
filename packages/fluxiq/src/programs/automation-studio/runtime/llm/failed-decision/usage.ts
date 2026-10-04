import type { AutomationStudioLlmUnusableDecisionError, AutomationStudioLlmUsageSummary } from "../index.ts";

/**
 * Paid usage is independent of whether a reply was unreadable, schema invalid,
 * or unanswered. Select it before the loop splits disposition; older callers
 * still carry it only in the screened unreadable reply account. Selection
 * itself charges nothing and grants no permission to execute a tool.
 */
export function automationStudioLlmFailedDecisionUsage(error: AutomationStudioLlmUnusableDecisionError | undefined): AutomationStudioLlmUsageSummary | undefined {
  return error?.usage ?? error?.reply?.usage;
}
