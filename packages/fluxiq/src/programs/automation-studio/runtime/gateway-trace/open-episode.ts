// One open traced episode: who it is (project, episode, trace, activity, Flow)
// and the screening sink its trace records through. The client gateway reaches
// `sink` through the episodes' capture source; HTTP run control reaches the
// episode through the registry and records with `recordControl`.

import type {
  ClientGatewayTraceActivity,
  ClientGatewayTraceManifest,
  ClientGatewayTraceRecordResult,
  ClientGatewayTraceSink
} from "../../../../client-gateway/index.ts";
import { automationStudioGatewayTraceControlInput } from "./control-event.ts";
import { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL } from "./control-vocabulary.ts";
import type { AutomationStudioGatewayTraceControlEvent, AutomationStudioGatewayTraceTermination } from "./types.ts";

export class AutomationStudioGatewayTraceOpenEpisode {
  readonly projectId: string;
  readonly episodeId: string;
  readonly traceId: string;
  readonly activity: ClientGatewayTraceActivity;
  readonly flowId: string | null;
  /** The screening sink: every event this episode's trace takes goes through it. */
  readonly sink: ClientGatewayTraceSink;

  constructor(identity: { projectId: string; episodeId: string; traceId: string; activity: ClientGatewayTraceActivity; flowId: string | null; sink: ClientGatewayTraceSink }) {
    this.projectId = identity.projectId;
    this.episodeId = identity.episodeId;
    this.traceId = identity.traceId;
    this.activity = identity.activity;
    this.flowId = identity.flowId;
    this.sink = identity.sink;
  }

  /**
   * Records a control event, screened. Content it arrived with is recorded
   * first, as an artifact on the control stream, and the event references it.
   */
  recordControl(event: AutomationStudioGatewayTraceControlEvent): ClientGatewayTraceRecordResult {
    const artifactIds: string[] = [];
    if (event.artifact !== undefined) {
      const stored = this.sink.recordArtifact({
        stream: AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL.stream,
        messageType: `control.${event.type}`,
        mediaType: event.artifact.mediaType,
        bytes: event.artifact.bytes,
        resourceKey: event.artifact.resourceKey,
        source: { id: null, sequence: null, timestamp: null },
        correlation: {
          commandId: event.correlation?.commandId ?? null,
          recordingId: event.correlation?.recordingId ?? null,
          causationEventId: event.correlation?.causationEventId ?? null,
          owner: null,
          observationRevision: null,
          baseRevision: null
        }
      });
      if (stored.status === "recorded" && stored.artifactId !== null) artifactIds.push(stored.artifactId);
    }
    return this.sink.record(automationStudioGatewayTraceControlInput(event, artifactIds));
  }

  /** Flushes and closes the trace; rejects when its final write failed (the stored trace then reads as truncated). */
  close(termination: AutomationStudioGatewayTraceTermination): Promise<ClientGatewayTraceManifest> {
    return this.sink.close({ terminationReason: termination.terminationReason, terminationDetail: termination.terminationDetail });
  }
}
