// A continuing judge switches to its native standalone format after an unreadable reply, on the same model.
import type { AutomationStudioResultUnreadableAsks } from "./asks.ts";

/** The routing members of a judge call's metadata: `continuesDecider` as given until the check goes standalone. */
export function automationStudioResultUnreadableRouting(asks: AutomationStudioResultUnreadableAsks, continuesDecider: boolean): { continuesDecider?: true; judgeStandaloneAfterUnreadable?: true } {
  return {
    ...(continuesDecider && !asks.standalone ? { continuesDecider: true as const } : {}),
    ...(continuesDecider && asks.standalone ? { judgeStandaloneAfterUnreadable: true as const } : {})
  };
}
