import { projectAutomationStudioFailureControlRecord } from "@fluxiq/contracts/automation-studio";
import { projectRuntimeTargetActionability } from "../../../../../runtime/result-control/index.ts";

/**
 * Only an execution envelope's optional failure and actionability metadata is projected before
 * raw-result observers see it. All actual execution and evidence facts stand;
 * opaque tool results are untouched. Descriptors avoid invoking a failure
 * getter, and a fresh envelope leaves the producer's object unchanged.
 */
export function automationStudioLlmEvidenceToolExecutionControl(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value) || (value as { kind?: unknown }).kind !== "llm_evidence_tool_execution") return value;
  const controlled = projectRuntimeTargetActionability(value);
  const fields = Object.getOwnPropertyDescriptors(controlled);
  const descriptor = fields.failure;
  if (!descriptor) return controlled;
  const failure = projectAutomationStudioFailureControlRecord(descriptor.value);
  delete fields.failure;
  if (failure) fields.failure = { ...descriptor, value: failure };
  return Object.defineProperties(Object.create(Object.getPrototypeOf(controlled)), fields);
}
