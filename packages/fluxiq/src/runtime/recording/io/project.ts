import type { AppendRecordingEntryInput } from "@fluxiq/contracts/recording";
import type { JsonObject } from "../../../core/index.ts";
import type { IoEnvelope, IoRegistry } from "../../../io/index.ts";
import { recordingEventIdentity } from "./identity.ts";
import { recordingInputPayload } from "./payload.ts";

export function projectRecordingInput<TTarget, TEvidence, TPayload = unknown>(io: IoRegistry, domainId: string, inputId: string, event: IoEnvelope<TPayload>): AppendRecordingEntryInput<TTarget, TEvidence> {
  const input = io.getInput(domainId, inputId);
  if (!input) throw new Error(`Input adapter not found: ${domainId}:${inputId}`);
  const role = input.definition.role ?? "state";
  const commonMetadata: JsonObject = { domainId, inputId: input.definition.id, inputRole: role, envelopeId: event.id, ...recordingEventIdentity(event.metadata) };
  if (role === "action") {
    const binding = io.resolveInputOutputBinding(domainId, inputId, event);
    if (binding) return {
      type: "action", actionType: binding.outputId, outputId: binding.outputId,
      ...(binding.confirmationInputId ? { confirmationInputId: binding.confirmationInputId, confirmationTimeoutMs: binding.confirmationTimeoutMs } : {}),
      parameters: binding.payload, origin: "operator", startedAt: event.timestampMs, completedAt: event.timestampMs, sourceId: `input.${input.definition.id}`,
      metadata: { ...commonMetadata, policyEligible: true, ...(binding.recordInputPayload ? { inputPayload: recordingInputPayload(event.payload) } : {}), ...(binding.metadata ?? {}) }
    };
  }
  return { type: "observation", observationType: `input.${role}`, payload: recordingInputPayload(event.payload), sourceId: `input.${input.definition.id}`, metadata: { ...commonMetadata, policyEligible: false } };
}
