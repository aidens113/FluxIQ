import type { RecordingSink } from "../../../../../runtime/recording/sink/index.ts";
import type { ActionTarget, EvidenceReference } from "../../../model/index.ts";
import type { AutomationStudioService } from "../../service.ts";

/** Delegates the six original service methods, preserving their locks and return values. */
export function createAutomationStudioRecordingSink(service: AutomationStudioService): RecordingSink<ActionTarget, EvidenceReference> {
  return {
    create: input => service.createRecording(input),
    append: input => service.appendRecordingEvent(input),
    appendBatch: input => service.appendRecordingEvents(input),
    appendDomain: input => service.appendRecordingDomainEvent(input),
    finalize: input => service.finalizeRecording(input),
    async read(input) {
      try {
        return { kind: "recording", recording: await service.getRecordingSession(input.recordingId, input.projectId) };
      } catch (cause) {
        return { kind: "unavailable", cause };
      }
    }
  };
}
