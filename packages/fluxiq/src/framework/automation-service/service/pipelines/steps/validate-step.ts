import { validateJsonValue, type DataStep } from "@fluxiq/contracts/fluxnode";
import { PipelineRejectedError, type PipelineProblem } from "../rejected-error.ts";
import type { PipelineRecord } from "../types.ts";

/**
 * Checks each record against the exact type. An invalid record is dropped
 * (`onInvalid: "drop"`) or, with `reject`, every problem is collected and the step
 * throws `PipelineRejectedError`.
 */
export function validateStep(step: Extract<DataStep, { kind: "validate" }>, records: readonly PipelineRecord[]): PipelineRecord[] {
  const problems: PipelineProblem[] = [];
  const kept: PipelineRecord[] = [];
  records.forEach((record, index) => {
    const errors = validateJsonValue(step.type, record.data);
    if (errors.length === 0) kept.push(record);
    else for (const error of errors) problems.push({ index, path: error.path, message: error.message });
  });
  if (step.onInvalid === "reject" && problems.length > 0) throw new PipelineRejectedError(step.id, problems);
  return kept;
}
