import type { JsonObject } from "../../../core/index.ts";
import { IoRegistry, type IoEnvelope } from "../../../io/index.ts";
import type { RecordingSession } from "../model/index.ts";
import type { AutomationStudioService } from "./service.ts";

/**
 * Converts importer-owned IO input events into recording evidence. Only action
 * inputs with an explicit output binding become executable policy evidence.
 */
export class AutomationStudioIoRecorder {
  constructor(
    private readonly options: {
      automationStudio: AutomationStudioService;
      io: IoRegistry;
      domainId: string;
      projectId?: string | null;
    }
  ) {}

  async recordInput<TPayload = unknown>(recordingId: string, inputId: string, event: IoEnvelope<TPayload>): Promise<RecordingSession> {
    const input = this.options.io.getInput(this.options.domainId, inputId);
    if (!input) throw new Error(`Input adapter not found: ${this.options.domainId}:${inputId}`);
    const role = input.definition.role ?? "state";
    const commonMetadata: JsonObject = {
      domainId: this.options.domainId,
      inputId: input.definition.id,
      inputRole: role,
      envelopeId: event.id
    };

    if (role === "action") {
      const binding = this.options.io.resolveInputOutputBinding(this.options.domainId, inputId, event);
      if (binding) {
        return this.options.automationStudio.appendRecordingEvent({
          ...(this.options.projectId !== undefined ? { projectId: this.options.projectId } : {}),
          recordingId,
          entry: {
            type: "action",
            actionType: binding.outputId,
            outputId: binding.outputId,
            ...(binding.confirmationInputId ? { confirmationInputId: binding.confirmationInputId, confirmationTimeoutMs: binding.confirmationTimeoutMs } : {}),
            parameters: binding.payload,
            origin: "operator",
            startedAt: event.timestampMs,
            completedAt: event.timestampMs,
            sourceId: `input.${input.definition.id}`,
            metadata: { ...commonMetadata, policyEligible: true, ...(binding.metadata ?? {}) }
          }
        });
      }
    }

    return this.options.automationStudio.appendRecordingEvent({
      ...(this.options.projectId !== undefined ? { projectId: this.options.projectId } : {}),
      recordingId,
      entry: {
        type: "observation",
        observationType: `input.${role}`,
        payload: asJsonObject(event.payload),
        sourceId: `input.${input.definition.id}`,
        metadata: { ...commonMetadata, policyEligible: false }
      }
    });
  }
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : { value: value as JsonObject[string] };
}
