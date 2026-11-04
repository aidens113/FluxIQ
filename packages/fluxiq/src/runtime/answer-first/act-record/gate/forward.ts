// The act record as a forward run asks it (`design.md`, "Forward run"): which rows
// and steps are done. Every pass reaches the act gate through the loop's executor, so
// this reports nothing back: `passed` is the caller's to add if it wants it.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import type { AutomationStudioAttemptActRecord } from "../record.ts";

/** `rowDone` and `stepDone` of the loop input's `forwardRun`, answered by the record. */
export function automationStudioAttemptActForward(record: AutomationStudioAttemptActRecord): { rowDone(row: JsonObject): boolean; stepDone(step: AutomationStudioFlowDraftStep): boolean } {
  return {
    rowDone: (row) => record.rowDone(row),
    stepDone: (step) => record.stepDone({ actionId: step.actionId, parameters: parametersOf(step) })
  };
}

/** What the step really ran with, and what the Flow keeps: else what it was written with. */
function parametersOf(step: AutomationStudioFlowDraftStep): JsonObject {
  return record(step.ranWith?.parameters) ?? record(step.input.parameters) ?? {};
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
