import type {
  ClientGatewayActionCommand,
  ClientGatewayActionResult,
  ClientGatewayEvent,
  ClientGatewayRecordingEvent,
  ClientGatewaySession,
  ClientGatewayStartRecordingRequest,
  ClientGatewayStopRecordingRequest,
  ClientGatewaySnapshot
} from "../../../client-gateway/index.ts";
import { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { JsonObject } from "../../../core/index.ts";
import { createEnvelope, IoRegistry } from "../../../io/index.ts";
import type { ActionChannelDescriptor, EnvironmentDescriptor, SourceDescriptor, StateSnapshot } from "../model/index.ts";
import { AutomationStudioIoRecorder } from "../runtime/io-bridge.ts";
import type { AutomationStudioService } from "../runtime/service.ts";

export type AutomationStudioClientGatewayBridgeOptions = {
  gateway: ClientGatewayService;
  automationStudio: AutomationStudioService;
  io?: IoRegistry;
  clientRecordingContextProvider?: ClientRecordingContextProvider;
  stopDrainMs?: number;
};

export type ClientRecordingContext =
  | { ok: true; projectId: string }
  | { ok: false; message: string; code?: string; metadata?: JsonObject };

export type ClientRecordingContextProvider = (input: {
  session: ClientGatewaySession;
  request: ClientGatewayStartRecordingRequest;
}) => ClientRecordingContext | Promise<ClientRecordingContext>;

export type StartClientRecordingInput = {
  sessionId: string;
  projectId?: string | null;
  taskId?: string;
  recordingId?: string;
  domainId?: string | null;
  metadata?: JsonObject;
};

type RecordingAppendQueueItem = {
  projectId?: string | null;
  recordingId: string;
  entry: Parameters<AutomationStudioService["appendRecordingEvent"]>[0]["entry"];
};

type RecordingAppendQueue = {
  entries: RecordingAppendQueueItem[];
  timer?: ReturnType<typeof setTimeout> | undefined;
  flushing?: Promise<void> | undefined;
};

export class AutomationStudioClientGatewayBridge {
  private readonly gateway: ClientGatewayService;
  private readonly automationStudio: AutomationStudioService;
  private readonly stopDrainMs: number;
  private readonly activeRecordings = new Map<string, { projectId?: string | null; recordingId: string; domainId?: string | null }>();
  private readonly appendQueues = new Map<string, RecordingAppendQueue>();
  private clientRecordingContextProvider: ClientRecordingContextProvider | undefined;
  private io: IoRegistry | undefined;

  constructor(options: AutomationStudioClientGatewayBridgeOptions) {
    this.gateway = options.gateway;
    this.automationStudio = options.automationStudio;
    this.stopDrainMs = Math.max(0, options.stopDrainMs ?? 250);
    this.io = options.io;
    this.clientRecordingContextProvider = options.clientRecordingContextProvider;
    this.gateway.onEvent((event) => this.handleGatewayEvent(event));
  }

  setClientRecordingContextProvider(provider: ClientRecordingContextProvider | undefined): void {
    this.clientRecordingContextProvider = provider;
  }

  /** Binds importer-registered inputs so gateway events can enter the IO pipeline. */
  bindIoRegistry(io: IoRegistry | undefined): this {
    this.io = io;
    return this;
  }

  async startRecording(input: StartClientRecordingInput) {
    const session = this.session(input.sessionId);
    const recordingId = input.recordingId ?? `client.${session.clientId}.${Date.now()}`;
    const projectId = input.projectId ?? session.projectId;
    const domainId = input.domainId ?? stringMetadataValue(session.metadata, "domainId") ?? null;
    const actionTypes = session.capabilities.flatMap((capability) => capability.actionTypes ?? []);
    const recording = await this.automationStudio.createRecording({
      ...(projectId !== undefined ? { projectId } : {}),
      recordingId,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      environment: {
        id: `client.${session.clientId}`,
        label: session.name,
        kind: session.clientType,
        domainId,
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
      metadata: { createdFrom: "client-gateway", sessionId: session.sessionId, clientId: session.clientId, clientName: session.name, ...(input.metadata ?? {}) }
    });
    this.activeRecordings.set(this.recordingOwnerKey(session), { ...(projectId !== undefined ? { projectId } : {}), recordingId, domainId });
    await this.gateway.startRecording(session.sessionId, {
      recordingId,
      ...(projectId !== undefined ? { projectId } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(domainId ? { domainId } : {})
    });
    return recording;
  }

  async stopRecording(sessionId: string) {
    const session = this.session(sessionId);
    const ownerKey = this.recordingOwnerKey(session);
    const active = this.activeRecordings.get(ownerKey);
    await this.gateway.stopRecording(sessionId, active?.recordingId);
    if (!active) return null;
    await delay(this.stopDrainMs);
    await this.flushRecordingEntries(ownerKey);
    const recording = await this.automationStudio.finalizeRecording({ ...(active.projectId !== undefined ? { projectId: active.projectId } : {}), recordingId: active.recordingId });
    this.activeRecordings.delete(ownerKey);

    return recording;
  }

  async executeAction(sessionId: string, command: ClientGatewayActionCommand): Promise<ClientGatewayActionResult> {
    const response = this.gateway.executeAction(sessionId, command);
    const result = await response.result;
    await this.appendActionResult(sessionId, command, result);
    return result;
  }

  private async handleGatewayEvent(event: ClientGatewayEvent): Promise<void> {
    if (event.type === "client.start_recording") {
      await this.startRecordingFromClient(event.session, event.message.payload);
      return;
    }
    if (event.type === "client.stop_recording") {
      await this.stopRecordingFromClient(event.session, event.message.payload);
      return;
    }
    if (event.type === "client.recording_entry") {
      const active = this.activeRecordings.get(this.recordingOwnerKey(event.session));
      if (!active) return;
      this.enqueueRecordingEntry(this.recordingOwnerKey(event.session), {
        ...(event.message.payload.projectId !== undefined ? { projectId: event.message.payload.projectId } : active?.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: event.message.payload.recordingId,
        entry: event.message.payload.entry as unknown as Parameters<AutomationStudioService["appendRecordingEvent"]>[0]["entry"]
      });
      return;
    }
    if (event.type === "client.recording_event") {
      await this.appendRecordingEvent(event.session, event.message.payload, event.message.id);
      return;
    }
    if (event.type === "client.snapshot") {
      await this.appendSnapshot(event.session, event.message.payload, event.message.id);
      return;
    }
    if (event.type === "client.state_update") {
      await this.appendStateUpdate(event.session, event.message.payload as JsonObject, event.message.id);
      return;
    }
    if (event.type === "client.error") {
      const active = this.activeRecordings.get(this.recordingOwnerKey(event.session));
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

  private async startRecordingFromClient(session: ClientGatewaySession, input: ClientGatewayStartRecordingRequest) {
    const context = await this.resolveClientRecordingContext(session, input);
    if (!context.ok) {
      await this.gateway.sendError(session.sessionId, {
        message: context.message,
        code: context.code ?? "recording.project_required",
        metadata: { source: "automation-studio", clientId: session.clientId, clientName: session.name, ...(context.metadata ?? {}) }
      });
      return null;
    }
    const domainId = input.domainId ?? stringMetadataValue(input.metadata, "domainId") ?? stringMetadataValue(session.metadata, "domainId") ?? null;
    const projectId = input.projectId ?? context.projectId;
    const recording = await this.automationStudio.createRecording({
      projectId,
      recordingId: input.recordingId,
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      environment: input.environment
        ? input.environment as unknown as Partial<EnvironmentDescriptor>
        : {
            id: `client.${session.clientId}`,
            label: session.name,
            kind: session.clientType,
            domainId,
            capabilities: session.capabilities.map((capability) => capability.id),
            metadata: compactJsonObject({ sessionId: session.sessionId, ...(session.version ? { version: session.version } : {}), ...(session.metadata ?? {}) })
          },
      sources: input.sources as unknown as SourceDescriptor[] | undefined ?? [
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
      actionChannels: input.actionChannels as unknown as ActionChannelDescriptor[] | undefined ?? [],
      initialState: input.initialState as unknown as StateSnapshot | undefined ?? emptyClientStateSnapshot(session),
      metadata: compactJsonObject({ createdFrom: "client-gateway", sessionId: session.sessionId, clientId: session.clientId, clientName: session.name, ...(input.metadata ?? {}) })
    });
    this.activeRecordings.set(this.recordingOwnerKey(session), { projectId, recordingId: recording.recordingId, domainId });
    this.gateway.markActiveRecording(session.sessionId, { recordingId: recording.recordingId, projectId });
    return recording;
  }

  private async resolveClientRecordingContext(session: ClientGatewaySession, request: ClientGatewayStartRecordingRequest): Promise<ClientRecordingContext> {
    if (this.clientRecordingContextProvider) return await this.clientRecordingContextProvider({ session, request });
    if (request.projectId) return { ok: true, projectId: request.projectId };
    return { ok: false, message: "Recording cannot start because Automation Studio does not have an open project.", code: "recording.project_required" };
  }

  private async stopRecordingFromClient(session: ClientGatewaySession, input: ClientGatewayStopRecordingRequest) {
    const ownerKey = this.recordingOwnerKey(session);
    const active = this.activeRecordings.get(ownerKey);
    const projectId = input.projectId ?? active?.projectId;
    await delay(this.stopDrainMs);
    await this.flushRecordingEntries(ownerKey);
    const recording = await this.automationStudio.finalizeRecording({
      ...(projectId !== undefined ? { projectId } : {}),
      recordingId: input.recordingId,
      ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {})
    });
    this.activeRecordings.delete(ownerKey);
    return recording;
  }

  private async appendRecordingEvent(session: ClientGatewaySession, event: ClientGatewayRecordingEvent, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(this.recordingOwnerKey(session));
    if (!active) return;
    await this.flushRecordingEntries(this.recordingOwnerKey(session));
    const domainId = event.domainId ?? active.domainId ?? stringMetadataValue(event.metadata, "domainId");
    const inputId = stringMetadataValue(event.metadata, "inputId");
    if (domainId && inputId && await this.recordGatewayInput({
      active,
      domainId,
      inputId,
      payload: event.payload ?? compactJsonObject({ ...(event.target ? { target: event.target } : {}) }),
      ...(event.timestamp !== undefined ? { timestampMs: event.timestamp } : {}),
      sourceId: event.sourceId ?? `client.${session.clientId}.events`,
      messageId,
      ...(event.metadata ? { metadata: event.metadata } : {})
    })) return;
    if (domainId) {
      const result = await this.automationStudio.appendRecordingDomainEvent({
        ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: active.recordingId,
        domainId,
        eventType: event.eventType,
        ...(event.eventId !== undefined ? { eventId: event.eventId } : {}),
        ...(event.timestamp !== undefined ? { timestamp: event.timestamp } : {}),
        sourceId: event.sourceId ?? `client.${session.clientId}.events`,
        ...(event.target !== undefined ? { target: event.target } : {}),
        ...(event.payload !== undefined ? { payload: event.payload } : {}),
        metadata: compactJsonObject({
          clientGatewayMessageId: messageId,
          clientId: session.clientId,
          ...(event.metadata ?? {})
        })
      });
      if (!result.accepted) {
        const message = result.issues.map((issue) => issue.path ? `${issue.path}: ${issue.message}` : issue.message).join("; ");
        await this.reportRejectedRecordingEvent(session, event, messageId, message || `Recording event ${domainId}.${event.eventType} was rejected.`);
      }
      return;
    }
    await this.reportRejectedRecordingEvent(session, event, messageId, "Recording event domainId is required.");
  }

  private async reportRejectedRecordingEvent(
    session: ClientGatewaySession,
    event: ClientGatewayRecordingEvent,
    messageId: string,
    reason: string
  ): Promise<void> {
    await this.gateway.sendError(session.sessionId, {
      message: reason,
      code: "recording.event_rejected",
      metadata: compactJsonObject({
        source: "automation-studio",
        clientGatewayMessageId: messageId,
        clientId: session.clientId,
        eventType: event.eventType,
        ...(event.eventId !== undefined ? { eventId: event.eventId } : {}),
        ...(event.domainId !== undefined ? { domainId: event.domainId } : {}),
        ...(event.metadata !== undefined ? { clientMetadata: event.metadata } : {})
      })
    });
  }

  private async appendSnapshot(session: ClientGatewaySession, snapshot: ClientGatewaySnapshot, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(this.recordingOwnerKey(session));
    if (!active) return;
    if (snapshot.kind === "state" && snapshot.state) {
      this.enqueueRecordingEntry(this.recordingOwnerKey(session), {
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
    this.enqueueRecordingEntry(this.recordingOwnerKey(session), {
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

  private async appendStateUpdate(session: ClientGatewaySession, stateUpdate: JsonObject, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(this.recordingOwnerKey(session));
    if (!active) return;
    const domainId = active.domainId ?? stringMetadataValue(stateUpdate.metadata as JsonObject | undefined, "domainId");
    const inputId = stringMetadataValue(stateUpdate.metadata as JsonObject | undefined, "inputId");
    if (domainId && inputId) {
      await this.flushRecordingEntries(this.recordingOwnerKey(session));
      if (await this.recordGatewayInput({
        active,
        domainId,
        inputId,
        payload: stateUpdate.state && typeof stateUpdate.state === "object" && !Array.isArray(stateUpdate.state) ? stateUpdate.state as JsonObject : stateUpdate,
        sourceId: `client.${session.clientId}.observations`,
        messageId,
        ...(stateUpdate.metadata && typeof stateUpdate.metadata === "object" && !Array.isArray(stateUpdate.metadata) ? { metadata: stateUpdate.metadata as JsonObject } : {})
      })) return;
    }
    this.enqueueRecordingEntry(this.recordingOwnerKey(session), {
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "observation",
        observationType: "client.state_update",
        sourceId: `client.${session.clientId}.observations`,
        correlationId: messageId,
        payload: stateUpdate
      }
    });
  }

  private async recordGatewayInput(input: {
    active: { projectId?: string | null; recordingId: string; domainId?: string | null };
    domainId: string;
    inputId: string;
    payload: JsonObject;
    timestampMs?: number;
    sourceId: string;
    messageId: string;
    metadata?: JsonObject;
  }): Promise<boolean> {
    if (!this.io?.hasInput(input.domainId, input.inputId)) return false;
    const recorder = new AutomationStudioIoRecorder({
      automationStudio: this.automationStudio,
      io: this.io,
      domainId: input.domainId,
      ...(input.active.projectId !== undefined ? { projectId: input.active.projectId } : {})
    });
    await recorder.recordInput(input.active.recordingId, input.inputId, createEnvelope({
      domainId: input.domainId,
      ioId: input.inputId,
      payload: input.payload,
      ...(input.timestampMs !== undefined ? { timestampMs: input.timestampMs } : {}),
      metadata: compactJsonObject({ sourceId: input.sourceId, clientGatewayMessageId: input.messageId, ...(input.metadata ?? {}) })
    }));
    return true;
  }

  private enqueueRecordingEntry(ownerKey: string, item: RecordingAppendQueueItem): void {
    const queue = this.appendQueues.get(ownerKey) ?? { entries: [] };
    queue.entries.push(item);
    this.appendQueues.set(ownerKey, queue);
    if (queue.entries.length >= 50) {
      void this.flushRecordingEntries(ownerKey);
      return;
    }
    if (!queue.timer) {
      queue.timer = setTimeout(() => {
        queue.timer = undefined;
        void this.flushRecordingEntries(ownerKey);
      }, 25);
    }
  }

  private async flushRecordingEntries(ownerKey: string): Promise<void> {
    const queue = this.appendQueues.get(ownerKey);
    if (!queue) return;
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = undefined;
    }
    if (queue.flushing) {
      await queue.flushing;
      if (queue.entries.length) await this.flushRecordingEntries(ownerKey);
      return;
    }
    queue.flushing = (async () => {
      while (queue.entries.length) {
        const batch = queue.entries.splice(0, 100);
        const groups = new Map<string, { projectId?: string | null; recordingId: string; entries: RecordingAppendQueueItem["entry"][] }>();
        for (const item of batch) {
          const key = `${item.projectId ?? ""}\n${item.recordingId}`;
          const group = groups.get(key) ?? { ...(item.projectId !== undefined ? { projectId: item.projectId } : {}), recordingId: item.recordingId, entries: [] };
          group.entries.push(item.entry);
          groups.set(key, group);
        }
        for (const group of groups.values()) await this.automationStudio.appendRecordingEvents(group);
      }
    })();
    try {
      await queue.flushing;
    } finally {
      queue.flushing = undefined;
      if (!queue.entries.length && !queue.timer) this.appendQueues.delete(ownerKey);
    }
  }

  private async appendActionResult(sessionId: string, command: ClientGatewayActionCommand, result: ClientGatewayActionResult): Promise<void> {
    const session = this.session(sessionId);
    const active = this.activeRecordings.get(this.recordingOwnerKey(session));
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

  private recordingOwnerKey(session: ClientGatewaySession): string {
    return session.trustedClientId ? `trusted:${session.trustedClientId}` : `session:${session.sessionId}`;
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

function stringMetadataValue(metadata: JsonObject | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}


