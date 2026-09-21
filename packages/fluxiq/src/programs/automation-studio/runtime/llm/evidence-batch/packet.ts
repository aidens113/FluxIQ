import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceBatchStopReason } from "./stop.ts";

export const AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_RESULT_TOOL_ID = "core.batch_result";

export type AutomationStudioLlmEvidenceBatchActionReceipt = {
  position: number;
  callId: string;
  toolId: string;
  effectApplied: boolean;
  targetsUnchanged?: boolean;
  resultCode?: string;
};

/** One bounded result shown after an ordered decision, with only the latest full evidence. */
export function automationStudioLlmEvidenceBatchResultPacket(input: {
  actions: readonly AutomationStudioLlmEvidenceBatchActionReceipt[];
  latestEvidence: JsonValue;
  stoppedBy?: AutomationStudioLlmEvidenceBatchStopReason;
}): JsonValue {
  return {
    schemaVersion: "automation-studio.evidence-batch-result.v1",
    actions: input.actions.map((action) => ({ ...action })),
    latestEvidence: structuredClone(input.latestEvidence),
    ...(input.stoppedBy ? { stoppedBy: input.stoppedBy } : {})
  };
}
