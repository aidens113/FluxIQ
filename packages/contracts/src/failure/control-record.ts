import { parseRuntimeFailureRecord } from "./parse-record.ts";
import type { RuntimeFailureRecord } from "./record.ts";

/**
 * A fresh failure record for control flow, without comparison text or evidence
 * digest. Validation stays identical to the normal failure reader; malformed
 * descriptive fields cannot be repaired by silently discarding them first.
 */
export function projectRuntimeFailureControlRecord(value: unknown): RuntimeFailureRecord | undefined {
  const parsed = parseRuntimeFailureRecord(value);
  if (!parsed) return undefined;
  const control: RuntimeFailureRecord = {
    category: parsed.category,
    code: parsed.code,
    retryable: parsed.retryable
  };
  if (parsed.stage !== undefined) control.stage = parsed.stage;
  if (parsed.effect !== undefined) control.effect = parsed.effect;
  if (parsed.retryAfterMs !== undefined) control.retryAfterMs = parsed.retryAfterMs;
  if (parsed.certainNoEffect === true) control.certainNoEffect = true;
  if (parsed.transient === true) control.transient = true;
  return control;
}

// Compatibility names retained for existing Automation Studio consumers.
export {
  projectRuntimeFailureControlRecord as projectAutomationStudioFailureControlRecord
};
