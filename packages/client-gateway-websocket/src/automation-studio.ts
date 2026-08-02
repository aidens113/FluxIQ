import type {
  AppendRecordingDomainEventRequest,
  AppendRecordingEntryRequest,
  CreateRecordingRequest,
  FinalizeRecordingRequest
} from "fluxiq/automation-studio";
import type { JsonObject } from "fluxiq/core";
import { FluxIQClientGatewayWebSocketClient } from "./transport";
import type { FluxIQClientGatewayWebSocketOptions } from "./types";

export type FluxIQAutomationStudioWebSocketClientOptions =
  | FluxIQClientGatewayWebSocketOptions
  | { gateway: FluxIQClientGatewayWebSocketClient };

export class FluxIQAutomationStudioWebSocketClient {
  readonly gateway: FluxIQClientGatewayWebSocketClient;

  constructor(options: FluxIQAutomationStudioWebSocketClientOptions) {
    this.gateway = "gateway" in options ? options.gateway : new FluxIQClientGatewayWebSocketClient(options);
  }

  connect(): Promise<void> {
    return this.gateway.connect();
  }

  close(code?: number, reason?: string): Promise<void> {
    return this.gateway.close(code, reason);
  }

  on: FluxIQClientGatewayWebSocketClient["on"] = (...args) => this.gateway.on(...args);

  createRecording(input: CreateRecordingRequest) {
    return this.gateway.send("client.start_recording", {
      recordingId: input.recordingId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.environment?.domainId !== undefined ? { domainId: input.environment.domainId } : {}),
      initialState: input.initialState as unknown as JsonObject,
      ...(input.environment !== undefined ? { environment: input.environment as unknown as JsonObject } : {}),
      ...(input.sources !== undefined ? { sources: input.sources as unknown as JsonObject[] } : {}),
      ...(input.actionChannels !== undefined ? { actionChannels: input.actionChannels as unknown as JsonObject[] } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
    });
  }

  appendRecordingEvent(input: AppendRecordingEntryRequest) {
    return this.gateway.send("client.recording_entry", {
      recordingId: input.recordingId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      entry: input.entry as unknown as JsonObject
    });
  }

  appendRecordingDomainEvent(input: AppendRecordingDomainEventRequest) {
    return this.gateway.send("client.recording_event", {
      eventType: input.eventType,
      domainId: input.domainId,
      recordingId: input.recordingId,
      ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
      ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
      ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      ...(input.metadata !== undefined || input.projectId !== undefined
        ? { metadata: { ...(input.metadata ?? {}), ...(input.projectId !== undefined ? { projectId: input.projectId } : {}) } }
        : {})
    });
  }

  finalizeRecording(input: FinalizeRecordingRequest) {
    return this.gateway.send("client.stop_recording", {
      recordingId: input.recordingId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {})
    });
  }
}
