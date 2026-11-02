import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../definitions.ts";
import type { RecordingFlowActionCandidate } from "../importer/recording-mapper/index.ts";

export function recordingCandidateParameters(candidate: RecordingFlowActionCandidate): AutomationStudioNodeDefinition["parameters"] {
  const payload = candidate.parameters && typeof candidate.parameters === "object" && !Array.isArray(candidate.parameters) ? candidate.parameters as JsonObject : {};
  return [
    { id: "parameters", label: "Output payload", description: "Values passed to this recorded output action.", valueType: "object" as const, defaultValue: payload },
    ...(candidate.expectedConfirmation ? [
      { id: "confirmationInputId", label: "Confirmation input", description: "Action input stream that confirms the output occurred.", valueType: "string" as const, defaultValue: candidate.expectedConfirmation.inputId ?? "", ui: { control: "identifier" as const, placeholder: "Registered action input ID" } },
      { id: "confirmationTimeoutMs", label: "Confirmation timeout", description: "How long to wait for confirmation.", valueType: "number" as const, defaultValue: candidate.expectedConfirmation.timeoutMs ?? 5_000 }
    ] : []),
    // The recorded action's own settings, editable on the node with the same
    // controls a hand-authored action gets (K3, K12d). Each default is what the
    // recording proposed, so a node nobody edited runs as it was recorded, and
    // an operator can still see the extraction and change which fields it keeps.
    { id: "timeoutMs", label: "Give up after milliseconds", description: "Maximum time to wait before treating this action as failed.", valueType: "number" as const, defaultValue: candidate.timeoutMs ?? 5_000 },
    {
      id: "recordOutput",
      label: "Save extracted records",
      description: "Save the records this output returns as a table. Leave off to save none.",
      valueType: "json" as const,
      defaultValue: candidate.recordOutput ? structuredClone(candidate.recordOutput) as unknown as JsonObject : null,
      // A binding could replace the schema, and with it the excluded fields, at run time.
      allowStateBinding: false,
      ui: { control: "record-output" as const }
    }
  ];
}
