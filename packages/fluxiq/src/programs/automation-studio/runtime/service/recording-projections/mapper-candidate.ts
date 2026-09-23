import type { JsonObject } from "../../../../../core/index.ts";
import type { RecordingSession } from "../../../model/index.ts";
import type { AutomationStudioRecordingMapperCandidate } from "../../../nodes/index.ts";
import { readableTokenValue } from "../evidence/index.ts";

// The mapper candidate an action entry becomes when a recording is mapped onto
// registered outputs.

export function recordingActionEntryCandidate(entry: RecordingSession["timeline"][number]): AutomationStudioRecordingMapperCandidate | null {
  if (entry.type !== "action") return null;
  const outputId = typeof entry.outputId === "string" && entry.outputId.trim()
    ? entry.outputId.trim()
    : typeof entry.actionType === "string" && entry.actionType.trim()
      ? entry.actionType.trim()
      : "";
  if (!outputId) return null;
  const metadata = entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata) ? entry.metadata as JsonObject : {};
  if (metadata.policyEligible === false) return null;
  const inputId = typeof metadata.inputId === "string" && metadata.inputId.trim()
    ? metadata.inputId.trim()
    : typeof entry.confirmationInputId === "string" && entry.confirmationInputId.trim()
      ? entry.confirmationInputId.trim()
      : undefined;
  return {
    outputId,
    parameters: entry.parameters && typeof entry.parameters === "object" && !Array.isArray(entry.parameters) ? entry.parameters as JsonObject : {},
    ...(inputId ? { sourceInputIds: [inputId] } : {}),
    ...(entry.confirmationInputId ? { expectedConfirmation: { inputId: entry.confirmationInputId, timeoutMs: entry.confirmationTimeoutMs ?? 5_000 } } : {}),
    confidence: 0.95,
    label: readableTokenValue(outputId)
  };
}
