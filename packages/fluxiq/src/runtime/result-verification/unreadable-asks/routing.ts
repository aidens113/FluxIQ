// A continuing judge stays in its conversation after an unreadable reply, on the same model (t1065).
import type { AutomationStudioResultUnreadableAsks } from "./asks.ts";

/**
 * The routing members of a judge call's metadata: `continuesDecider` as given, and `judgeAnswersInConversation` once a
 * continuing judge's reply could not be read, for the adapter to answer that reply in the judge's own conversation
 * (`../../llm/anthropic/provider.ts`).
 */
export function automationStudioResultUnreadableRouting(asks: AutomationStudioResultUnreadableAsks, continuesDecider: boolean): { continuesDecider?: true; judgeAnswersInConversation?: true } {
  return {
    ...(continuesDecider ? { continuesDecider: true as const } : {}),
    ...(continuesDecider && asks.inConversation ? { judgeAnswersInConversation: true as const } : {})
  };
}
