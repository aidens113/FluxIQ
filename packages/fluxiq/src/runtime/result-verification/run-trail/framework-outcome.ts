import { projectAutomationStudioFailureControlRecord } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../core/index.ts";

/** Actual framework outcomes, outside the opaque domain projector's authority. No comparison text or raw evidence. */
export function automationStudioResultFrameworkOutcome(value: { resultCode?: unknown; resultReason?: unknown; effectApplied?: unknown; failure?: unknown; status?: unknown; route?: unknown; skipped?: unknown; step?: unknown; pass?: unknown; of?: unknown; consequences?: unknown }): JsonObject {
  const outcome: JsonObject = {};
  for (const key of ["resultCode", "resultReason", "status", "route"] as const) if (typeof value[key] === "string") outcome[key] = value[key];
  if (typeof value.effectApplied === "boolean") outcome.effectApplied = value.effectApplied;
  if (Array.isArray(value.consequences) && value.consequences.every((item) => typeof item === "string")) outcome.consequences = [...value.consequences];
  for (const key of ["step", "pass", "of"] as const) if (typeof value[key] === "number" && Number.isSafeInteger(value[key]) && value[key] >= 0) outcome[key] = value[key];
  if (value.failure !== undefined) {
    const failure = projectAutomationStudioFailureControlRecord(value.failure);
    outcome.failure = failure === undefined ? { metadata: "invalid", present: true } : { ...failure };
  }
  if (value.skipped !== undefined && value.skipped !== false) {
    // A typed skip is an execution fact, not the domain's conclusion about success.
    if (value.skipped !== null && typeof value.skipped === "object" && !Array.isArray(value.skipped)) {
      const skip = value.skipped as Record<string, unknown>;
      const kept: JsonObject = {};
      for (const key of ["reason", "code", "attemptId", "row", "toNodeId", "direction"] as const) if (typeof skip[key] === "string") kept[key] = skip[key];
      if (skip.notDone === true) kept.notDone = true;
      outcome.skipped = kept;
    } else outcome.skipped = true;
  }
  return outcome;
}
