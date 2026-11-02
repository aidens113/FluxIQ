import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../definitions.ts";

export function materializeRecordingNode<T extends { definitionId: string; parameterValues?: JsonObject; metadata?: JsonObject }>(node: T, definition: AutomationStudioNodeDefinition | undefined): T {
  if (!definition || definition.source.kind !== "recording") return node;
  const confirmation = definition.metadata?.expectedConfirmation && typeof definition.metadata.expectedConfirmation === "object" && !Array.isArray(definition.metadata.expectedConfirmation) ? definition.metadata.expectedConfirmation as JsonObject : undefined;
  const authored = node.parameterValues ?? {};
  const recordOutput = definition.metadata?.recordOutput;
  const timeoutMs = definition.metadata?.timeoutMs;
  return {
    ...node,
    definitionId: "builtin.policy.action",
    parameterValues: compactJsonObject({
      ...authored,
      outputId: definition.metadata?.outputId,
      parameters: definition.metadata?.parameters ?? {},
      ...(typeof confirmation?.inputId === "string" ? { confirmationInputId: confirmation.inputId, confirmationTimeoutMs: typeof confirmation.timeoutMs === "number" ? confirmation.timeoutMs : 5_000 } : {}),
      // `null` is a value the node holds: the editor writes it when the
      // operator turns the extraction off, so it must not be overridden either.
      ...(authored.recordOutput === undefined && isJsonRecord(recordOutput) ? { recordOutput } : {}),
      ...(authored.timeoutMs === undefined && typeof timeoutMs === "number" ? { timeoutMs } : {})
    }),
    metadata: { ...(node.metadata ?? {}), recordingDefinitionId: definition.id, recordingProposalId: definition.source.proposalId }
  };
}

function compactJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject;
}

function isJsonRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
