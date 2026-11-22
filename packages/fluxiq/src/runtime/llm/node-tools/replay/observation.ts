import type { AutomationStudioFailureRecord, AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";

/** Actual replay evidence and optional execution metadata, retained on cached reuse without inferring missing facts. */
export type AutomationStudioFlowDraftReplayObservation = { step: number; stepId?: string; resultCode?: string; evidence: JsonValue; pass?: number; of?: number; records?: JsonObject[]; effectApplied?: boolean; failure?: AutomationStudioFailureRecord; recordSchema?: AutomationStudioRecordSchema | null; consequences?: string[] };

/** The same constructor for a normal draft step and a repeated pass. No execution/retry decision is made here. */
export function automationStudioFlowDraftReplayObservation(step: { step: number; stepId?: string; pass?: number; of?: number; consequences?: unknown }, result: { evidence: JsonValue; resultCode?: string; effectApplied?: boolean; failure?: AutomationStudioFailureRecord; recordSchema?: AutomationStudioRecordSchema | null }, records?: JsonObject[]): AutomationStudioFlowDraftReplayObservation {
  return {
    step: step.step,
    ...(step.stepId === undefined ? {} : { stepId: step.stepId }),
    ...(step.pass === undefined ? {} : { pass: step.pass }),
    ...(step.of === undefined ? {} : { of: step.of }),
    ...(Array.isArray(step.consequences) && step.consequences.every((item) => typeof item === "string") ? { consequences: [...step.consequences] } : {}),
    ...(result.resultCode === undefined ? {} : { resultCode: result.resultCode }),
    evidence: result.evidence,
    ...(records === undefined ? {} : { records }),
    ...(result.effectApplied === undefined ? {} : { effectApplied: result.effectApplied }),
    ...(result.failure === undefined ? {} : { failure: result.failure }),
    ...(result.recordSchema === undefined ? {} : { recordSchema: result.recordSchema })
  };
}
