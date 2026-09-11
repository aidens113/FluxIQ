import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "./contracts.ts";

export function automationStudioTraceSummary(trace: AutomationStudioGraphExecutionTrace): JsonObject {
  return {
    status: trace.status,
    attempts: trace.attempts.length,
    effects: trace.effects.length,
    ...(trace.currentNodeId ? { currentNodeId: trace.currentNodeId } : {}),
    ...(trace.message ? { message: trace.message } : {})
  };
}
