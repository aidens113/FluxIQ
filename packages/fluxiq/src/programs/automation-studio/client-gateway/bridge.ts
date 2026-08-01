import type {
  ClientGatewayActionCommand,
  ClientGatewayActionResult,
  ClientGatewayEvent,
  ClientGatewayRecordingEvent,
  ClientGatewaySession,
  ClientGatewaySnapshot
} from "../../../client-gateway";
import { ClientGatewayService } from "../../../client-gateway";
import type { JsonObject } from "../../../core";
import type { StateSnapshot } from "../model";
import type { AutomationStudioService } from "../runtime/service";

export type AutomationStudioClientGatewayBridgeOptions = {
  gateway: ClientGatewayService;
  automationStudio: AutomationStudioService;
};

export type StartClientRecordingInput = {
  sessionId: string;
  projectId?: string | null;
  taskId?: string;
  recordingId?: string;
  metadata?: JsonObject;
};

export class AutomationStudioClientGatewayBridge {
  private readonly gateway: ClientGatewayService;
  private readonly automationStudio: AutomationStudioService;
  private readonly activeRecordings = new Map<string, { projectId?: string | null; recordingId: string }>();

  constructor(options: AutomationStudioClientGatewayBridgeOptions) {
    this.gateway = options.gateway;
    this.automationStudio = options.automationStudio;
    this.gateway.onEvent((event) => this.handleGatewayEvent(event));
  }

  async startRecording(input: StartClientRecordingInput) {
    const session = this.session(input.sessionId);
    const recordingId = input.recordingId ?? `client.${session.clientId}.${Date.now()}`;
    const projectId = input.projectId ?? session.projectId;
    const actionTypes = session.capabilities.flatMap((capability) => capability.actionTypes ?? []);
    const recording = await this.automationStudio.createRecording({
      ...(projectId !== undefined ? { projectId } : {}),
      recordingId,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      environment: {
        id: `client.${session.clientId}`,
        label: session.name,
        kind: session.clientType,
        domainId: null,
        capabilities: session.capabilities.map((capability) => capability.id),
        metadata: compactJsonObject({ sessionId: session.sessionId, ...(session.version ? { version: session.version } : {}), ...(session.metadata ?? {}) })
      },
      sources: [
        {
          id: `client.${session.clientId}.events`,
          label: `${session.name} events`,
          kind: "event",
          metadata: { sessionId: session.sessionId, clientType: session.clientType }
        },
        {
          id: `client.${session.clientId}.observations`,
          label: `${session.name} observations`,
          kind: "observation",
          metadata: { sessionId: session.sessionId, clientType: session.clientType }
        }
      ],
      actionChannels: [
        {
          id: `client.${session.clientId}.actions`,
          label: `${session.name} action channel`,
          actionTypes,
          capabilities: session.capabilities.map((capability) => capability.id),
          metadata: { sessionId: session.sessionId, clientType: session.clientType }
        }
      ],
      initialState: emptyClientStateSnapshot(session),
      metadata: { createdFrom: "client-gateway", sessionId: session.sessionId, ...(input.metadata ?? {}) }
    });
    this.activeRecordings.set(session.sessionId, { ...(projectId !== undefined ? { projectId } : {}), recordingId });
    await this.gateway.startRecording(session.sessionId, { recordingId, ...(projectId !== undefined ? { projectId } : {}), ...(input.taskId !== undefined ? { taskId: input.taskId } : {}) });
    return recording;
  }

  async stopRecording(sessionId: string) {
    const active = this.activeRecordings.get(sessionId);
    await this.gateway.stopRecording(sessionId, active?.recordingId);
    if (!active) return null;
    const recording = await this.automationStudio.finalizeRecording({ ...(active.projectId !== undefined ? { projectId: active.projectId } : {}), recordingId: active.recordingId });
    this.activeRecordings.delete(sessionId);
    return recording;
  }

  async executeAction(sessionId: string, command: ClientGatewayActionCommand): Promise<ClientGatewayActionResult> {
    const response = this.gateway.executeAction(sessionId, command);
    const result = await response.result;
    await this.appendActionResult(sessionId, command, result);
    return result;
  }

  private async handleGatewayEvent(event: ClientGatewayEvent): Promise<void> {
    if (event.type === "client.recording_event") {
      await this.appendRecordingEvent(event.session, event.message.payload, event.message.id);
      return;
    }
    if (event.type === "client.dom_snapshot") {
      await this.appendSnapshot(event.session, event.message.payload, event.message.id);
      return;
    }
    if (event.type === "client.browser_state") {
      await this.appendBrowserState(event.session, event.message.payload as JsonObject, event.message.id);
      return;
    }
    if (event.type === "client.error") {
      const active = this.activeRecordings.get(event.session.sessionId);
      if (active) await this.automationStudio.appendRecordingEvent({
        ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: active.recordingId,
        entry: {
          type: "marker",
          label: `Client error: ${event.message.payload.message}`,
          ...(event.message.timestamp !== undefined ? { timestamp: event.message.timestamp } : {}),
          sourceId: `client.${event.session.clientId}.events`,
          metadata: compactJsonObject({ ...(event.message.payload.code ? { code: event.message.payload.code } : {}), ...(event.message.payload.metadata ?? {}) })
        }
      });
    }
  }

  private async appendRecordingEvent(session: ClientGatewaySession, event: ClientGatewayRecordingEvent, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(session.sessionId);
    if (!active) return;
    await this.automationStudio.appendRecordingEvent({
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "domain_event",
        eventType: event.eventType,
        ...(event.timestamp !== undefined ? { timestamp: event.timestamp } : {}),
        sourceId: event.sourceId ?? `client.${session.clientId}.events`,
        correlationId: event.eventId ?? messageId,
        payload: compactJsonObject({
          ...(event.target !== undefined ? { target: event.target } : {}),
          ...(event.payload !== undefined ? { payload: event.payload } : {}),
          ...(event.metadata !== undefined ? { metadata: event.metadata } : {})
        })
      }
    });
  }

  private async appendSnapshot(session: ClientGatewaySession, snapshot: ClientGatewaySnapshot, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(session.sessionId);
    if (!active) return;
    if (snapshot.kind === "state" && snapshot.state) {
      await this.automationStudio.appendRecordingEvent({
        ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: active.recordingId,
        entry: {
          type: "observation",
          observationType: "client.state_snapshot",
          ...(snapshot.timestamp !== undefined ? { timestamp: snapshot.timestamp } : {}),
          sourceId: `client.${session.clientId}.observations`,
          correlationId: snapshot.snapshotId ?? messageId,
          payload: compactJsonObject({ state: snapshot.state, ...(snapshot.metadata !== undefined ? { metadata: snapshot.metadata } : {}) })
        }
      });
      return;
    }
    await this.automationStudio.appendRecordingEvent({
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "observation",
        observationType: `client.${snapshot.kind}_snapshot`,
        ...(snapshot.timestamp !== undefined ? { timestamp: snapshot.timestamp } : {}),
        sourceId: `client.${session.clientId}.observations`,
        correlationId: snapshot.snapshotId ?? messageId,
        payload: compactJsonObject({
          ...(snapshot.payload !== undefined ? { payload: snapshot.payload } : {}),
          ...(snapshot.metadata !== undefined ? { metadata: snapshot.metadata } : {})
        })
      }
    });
  }

  private async appendBrowserState(session: ClientGatewaySession, browserState: JsonObject, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(session.sessionId);
    if (!active) return;
    await this.automationStudio.appendRecordingEvent({
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "observation",
        observationType: "client.browser_state",
        sourceId: `client.${session.clientId}.observations`,
        correlationId: messageId,
        payload: browserState
      }
    });
  }

  private async appendActionResult(sessionId: string, command: ClientGatewayActionCommand, result: ClientGatewayActionResult): Promise<void> {
    const session = this.session(sessionId);
    const active = this.activeRecordings.get(sessionId);
    if (!active) return;
    await this.automationStudio.appendRecordingEvent({
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "action",
        actionType: command.actionType,
        parameters: command.parameters ?? {},
        ...(command.target ? { target: { type: String(command.target.type ?? "client-target"), metadata: command.target } } : {}),
        origin: "runtime",
        startedAt: result.startedAt ?? Date.now(),
        ...(result.completedAt !== undefined ? { completedAt: result.completedAt } : {}),
        sourceId: `client.${session.clientId}.events`,
        correlationId: result.commandId,
        result: {
          status: result.status,
          ...(result.message ?? result.error ? { message: result.message ?? result.error } : {}),
          metadata: compactJsonObject({ ...(result.payload !== undefined ? { payload: result.payload } : {}), ...(result.metadata ?? {}) })
        }
      }
    });
  }

  private session(sessionId: string): ClientGatewaySession {
    const session = this.gateway.snapshot().sessions.find((item) => item.sessionId === sessionId);
    if (!session) throw new Error(`Unknown client gateway session: ${sessionId}`);
    return session;
  }
}

function emptyClientStateSnapshot(session: ClientGatewaySession): StateSnapshot {
  return {
    timestamp: Date.now(),
    namespaces: {
      client: {
        schemaId: "fluxiq.client-gateway.client-state",
        schemaVersion: "0.1",
        values: {
          clientId: { type: "string", value: session.clientId, observedAt: Date.now(), sourceId: `client.${session.clientId}.events` },
          clientType: { type: "string", value: session.clientType, observedAt: Date.now(), sourceId: `client.${session.clientId}.events` }
        }
      }
    }
  };
}

function compactJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject;
}
