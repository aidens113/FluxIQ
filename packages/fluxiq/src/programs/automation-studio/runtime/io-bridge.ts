import { RecordingIoRecorder } from "../../../runtime/recording/io/index.ts";
import type { IoRegistry } from "../../../io/index.ts";
import type { ActionTarget, EvidenceReference } from "../model/index.ts";
import type { AutomationStudioService } from "./service.ts";
import { createAutomationStudioRecordingSink } from "./service/recording-sink/index.ts";

/** Compatibility constructor: canonical IO projection owns the actual recorder. */
export class AutomationStudioIoRecorder extends RecordingIoRecorder<ActionTarget, EvidenceReference> {
  constructor(options: { automationStudio: AutomationStudioService; io: IoRegistry; domainId: string; projectId?: string | null }) {
    super({ sink: createAutomationStudioRecordingSink(options.automationStudio), io: options.io, domainId: options.domainId, ...(options.projectId !== undefined ? { projectId: options.projectId } : {}) });
  }
}
