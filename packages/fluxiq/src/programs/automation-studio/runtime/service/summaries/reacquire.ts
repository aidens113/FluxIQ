import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioTargetReacquireRecord } from "../../executor/target-reacquire/index.ts";

/** Public recovery metadata contains only its closed result and real source IDs, never target data. */
export function automationStudioRunDetailReacquire(record: AutomationStudioTargetReacquireRecord): JsonObject {
  const result: JsonObject = { kind: record.kind, outcome: record.outcome, ...(record.reason ? { reason: record.reason } : {}) };
  if (record.kind !== "identity") {
    result.sourceNodeId = record.sourceNodeId;
    if (record.returned) result.returned = true;
  }
  return result;
}
