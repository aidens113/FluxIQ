import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { IoEnvelope, IoRegistry } from "../../../io/index.ts";
import type { RecordingSink } from "../sink/index.ts";
import { projectRecordingInput } from "./project.ts";

export class RecordingIoRecorder<TTarget, TEvidence> {
  constructor(private readonly options: { sink: Pick<RecordingSink<TTarget, TEvidence>, "append">; io: IoRegistry; domainId: string; projectId?: string | null }) {}

  async recordInput<TPayload = unknown>(recordingId: string, inputId: string, event: IoEnvelope<TPayload>): Promise<RecordingSession<TTarget, TEvidence>> {
    return await this.options.sink.append({
      ...(this.options.projectId !== undefined ? { projectId: this.options.projectId } : {}), recordingId,
      entry: projectRecordingInput<TTarget, TEvidence, TPayload>(this.options.io, this.options.domainId, inputId, event)
    });
  }
}
