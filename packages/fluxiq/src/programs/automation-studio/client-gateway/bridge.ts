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
  | { ok: true; projectId: string; taskId?: string }
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
  sender: ClientMessageSender;
};

type RecordingAppendQueue = {
  entries: RecordingAppendQueueItem[];
  timer?: ReturnType<typeof setTimeout> | undefined;
  flushing?: Promise<void> | undefined;
};

/**
 * What became of the recording a client last wrote to — finalized here, or refused at
 * its start and so never given `finalizedAt` — kept so a message meant for it is named.
 */
type ClosedClientRecording = {
  recordingId?: string;
  projectId?: string | null;
  domainId?: string | null;
  finalizedAt?: number;
  discardedEvents: number;
  discardedActions: number;
  reported: boolean;
};

/** What a discarded message was, as far as the bridge can tell without it. */
type DiscardedClientMessage = {
  kind: "recording event" | "recording entry" | "snapshot" | "state update" | "error";
  label: string;
  domainId?: string | null;
  inputId?: string | undefined;
  recordingId?: string | undefined;
  /** Set when the payload itself says this was an action, not evidence. */
  executable?: boolean;
};

/** A message on its way into a recording, and the session that sent it. */
type ClientMessageSender = { session: ClientGatewaySession; message: DiscardedClientMessage };

/** The recording a client is writing to, as far as the bridge knows it. */
type ClientRecordingRef = { projectId?: string | null; recordingId: string; domainId?: string | null };

/** Owner keys remembered after their recording closed. One entry per client. */
const CLOSED_RECORDING_MEMORY = 32;

export class AutomationStudioClientGatewayBridge {
  private readonly gateway: ClientGatewayService;
  private readonly automationStudio: AutomationStudioService;
  private readonly stopDrainMs: number;
  private readonly activeRecordings = new Map<string, { projectId?: string | null; recordingId: string; domainId?: string | null }>();
  private readonly appendQueues = new Map<string, RecordingAppendQueue>();
  private readonly closedRecordings = new Map<string, ClosedClientRecording>();
  private readonly pendingStarts = new Map<string, PendingClientStart>();
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
    this.closedRecordings.delete(this.recordingOwnerKey(session));
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
    this.rememberClosedRecording(ownerKey, {
      recordingId: active.recordingId,
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      ...(active.domainId !== undefined ? { domainId: active.domainId } : {})
    });

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
    if (event.type === "session.ready" || event.type === "session.disconnected" || event.type === "client.action_result") return;
    await this.awaitClientStart(event.session, event.type === "client.stop_recording" ? event.message.payload.recordingId : undefined);
    if (event.type === "client.stop_recording") {
      await this.stopRecordingFromClient(event.session, event.message.payload);
      return;
    }
    if (event.type === "client.recording_entry") {
      const active = this.activeRecordings.get(this.recordingOwnerKey(event.session));
      const entry = event.message.payload.entry as { type?: unknown } | undefined;
      const message: DiscardedClientMessage = {
        kind: "recording entry",
        label: typeof entry?.type === "string" ? entry.type : "unknown",
        recordingId: event.message.payload.recordingId,
        executable: entry?.type === "action"
      };
      if (!active) {
        this.noteDiscardedClientMessage(event.session, message);
        return;
      }
      this.enqueueRecordingEntry(this.recordingOwnerKey(event.session), {
        ...(event.message.payload.projectId !== undefined ? { projectId: event.message.payload.projectId } : active?.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: event.message.payload.recordingId,
        entry: event.message.payload.entry as unknown as Parameters<AutomationStudioService["appendRecordingEvent"]>[0]["entry"],
        sender: { session: event.session, message }
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
      if (active) await this.appendOrDiscard(active, [{ session: event.session, message: { kind: "error", label: "marker", executable: false } }], () => this.automationStudio.appendRecordingEvent({
        ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
        recordingId: active.recordingId,
        entry: {
          type: "marker",
          label: `Client error: ${event.message.payload.message}`,
          ...(event.message.timestamp !== undefined ? { timestamp: event.message.timestamp } : {}),
          sourceId: `client.${event.session.clientId}.events`,
          metadata: compactJsonObject({ ...(event.message.payload.code ? { code: event.message.payload.code } : {}), ...(event.message.payload.metadata ?? {}) })
        }
      }));
    }
  }

  /**
   * Registered before its first await, so later messages from the client wait for it; a
   * start refused or thrown is remembered, so what waited is discarded under its id.
   */
  private async startRecordingFromClient(session: ClientGatewaySession, input: ClientGatewayStartRecordingRequest) {
    const ownerKey = this.recordingOwnerKey(session);
    const previous = this.pendingStarts.get(ownerKey);
    let settle = () => {};
    const pending: PendingClientStart = { recordingId: input.recordingId, stopRequested: false, settled: new Promise<void>((resolve) => { settle = resolve; }) };
    this.pendingStarts.set(ownerKey, pending);
    try {
      await previous?.settled;
      return await this.openClientRecording(session, input, pending);
    } finally {
      if (this.activeRecordings.get(ownerKey)?.recordingId !== input.recordingId) this.rememberClosedRecording(ownerKey, { recordingId: input.recordingId, ...(input.projectId !== undefined ? { projectId: input.projectId } : {}) }, false);
      if (this.pendingStarts.get(ownerKey) === pending) this.pendingStarts.delete(ownerKey);
      settle();
    }
  }

  /**
   * Holds a message until its client's start settles, so it meets the recording that start
   * opens or its refusal: the WebSocket host handles one socket's messages concurrently.
   * A Stop for that recording also withdraws the start's acknowledgement.
   */
  private async awaitClientStart(session: ClientGatewaySession, stoppingRecordingId: string | undefined): Promise<void> {
    const pending = this.pendingStarts.get(this.recordingOwnerKey(session));
    if (!pending) return;
    if (stoppingRecordingId === pending.recordingId) pending.stopRequested = true;
    await pending.settled;
  }

  private async openClientRecording(session: ClientGatewaySession, input: ClientGatewayStartRecordingRequest, pending: PendingClientStart) {
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
    const taskId = input.taskId ?? context.taskId;
    const recording = await this.automationStudio.createRecording({
      projectId,
      recordingId: input.recordingId,
      ...(taskId !== undefined ? { taskId } : {}),
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
    this.closedRecordings.delete(this.recordingOwnerKey(session));
    // Acknowledged only once open, and never to a client that has already sent Stop.
    const accepted = { recordingId: recording.recordingId, projectId, ...(taskId !== undefined ? { taskId } : {}), ...(domainId ? { domainId } : {}) };
    if (pending.stopRequested) this.gateway.markActiveRecording(session.sessionId, accepted);
    else await this.gateway.startRecording(session.sessionId, accepted);
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
    this.rememberClosedRecording(ownerKey, {
      recordingId: input.recordingId,
      ...(projectId !== undefined ? { projectId } : {}),
      ...(active?.domainId !== undefined ? { domainId: active.domainId } : {})
    });
    return recording;
  }

  private async appendRecordingEvent(session: ClientGatewaySession, event: ClientGatewayRecordingEvent, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(this.recordingOwnerKey(session));
    // The recording this event belongs to is not open here: finalized, which is
    // immutable, or its start was refused. The event cannot be kept; the one thing
    // that must not happen is for it to disappear without anyone being told.
    if (!active) {
      this.noteDiscardedClientMessage(session, {
        kind: "recording event",
        label: event.eventType,
        recordingId: event.recordingId,
        ...(event.domainId !== undefined ? { domainId: event.domainId } : {}),
        inputId: stringMetadataValue(event.metadata, "inputId")
      });
      return;
    }
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
      ...(event.metadata ? { metadata: event.metadata } : {}),
      sender: { session, message: { kind: "recording event", label: event.eventType, domainId, inputId } }
    })) return;
    if (domainId) {
      const result = await this.appendOrDiscard(active, [{ session, message: { kind: "recording event", label: event.eventType, domainId, inputId } }], () => this.automationStudio.appendRecordingDomainEvent({
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
      }));
      if (result && !result.accepted) {
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

  /**
   * Remembers a recording the bridge has just finalized, or a client start it did
   * not open (`finalized` false). Only the last one per client is kept, and only
   * so a message arriving moments later can name the recording it was meant for.
   */
  private rememberClosedRecording(ownerKey: string, closed: { recordingId: string; projectId?: string | null; domainId?: string | null }, finalized = true): void {
    // A message that lost the race to finalization remembers the recording
    // first; closing it afterwards must keep that message's count.
    if (this.closedRecordings.get(ownerKey)?.recordingId === closed.recordingId) return;
    this.closedRecordings.delete(ownerKey);
    while (this.closedRecordings.size >= CLOSED_RECORDING_MEMORY) {
      const oldest = this.closedRecordings.keys().next();
      if (oldest.done) break;
      this.closedRecordings.delete(oldest.value);
    }
    this.closedRecordings.set(ownerKey, { ...closed, ...(finalized ? { finalizedAt: Date.now() } : {}), discardedEvents: 0, discardedActions: 0, reported: false });
  }

  /**
   * Counts a client message the bridge had to throw away, and puts it in the
   * gateway audit log where an operator can see it.
   *
   * Every discarded executable action is reported, because each one is a piece
   * of the user's work that the client thinks was recorded and Core does not
   * have. Evidence — snapshots, state, observations — is reported once per
   * closed recording and counted thereafter: a page unloading after Stop
   * legitimately emits a trail of it, and an entry per event would train the
   * reader to ignore all of them.
   */
  private noteDiscardedClientMessage(session: ClientGatewaySession, discarded: DiscardedClientMessage): void {
    const ownerKey = this.recordingOwnerKey(session);
    const closed = this.closedRecordings.get(ownerKey) ?? { discardedEvents: 0, discardedActions: 0, reported: false };
    this.closedRecordings.set(ownerKey, closed);
    const executable = discarded.executable ?? this.isExecutableActionInput(discarded.domainId ?? closed.domainId, discarded.inputId);
    closed.discardedEvents += 1;
    if (executable) closed.discardedActions += 1;
    if (closed.reported && !executable) return;
    closed.reported = true;
    const recordingId = discarded.recordingId ?? closed.recordingId;
    const remembered = recordingId === closed.recordingId;
    const sinceFinalizedMs = !remembered || closed.finalizedAt === undefined ? undefined : Math.max(0, Date.now() - closed.finalizedAt);
    this.gateway.recordAuditEvent({
      type: executable ? "recording.action_discarded" : "recording.event_discarded",
      message: discardedClientMessageSummary(discarded, recordingId, executable, sinceFinalizedMs),
      sessionId: session.sessionId,
      metadata: compactJsonObject({
        source: "automation-studio",
        clientId: session.clientId,
        clientName: session.name,
        recordingId,
        projectId: remembered ? closed.projectId : undefined,
        eventType: discarded.label,
        inputId: discarded.inputId,
        domainId: discarded.domainId ?? closed.domainId ?? undefined,
        executable,
        discardedEvents: closed.discardedEvents,
        discardedActions: closed.discardedActions,
        sinceFinalizedMs
      })
    });
  }

  /**
   * Whether the discarded message would have become an executable action entry
   * rather than evidence. An unregistered or unmapped input reads as evidence,
   * so an unknown message is reported quietly rather than as lost work.
   */
  private isExecutableActionInput(domainId: string | null | undefined, inputId: string | undefined): boolean {
    if (!domainId || !inputId) return false;
    return (this.io?.getInput(domainId, inputId)?.definition.role ?? "state") === "action";
  }

  /**
   * Runs an append to a client's recording, and reports the messages it carried
   * as discarded when the recording turns out to have been finalized while they
   * were on their way. Returns undefined for a discard.
   *
   * Stop finalizes a recording before it closes it here, so for that moment a
   * late message still finds the recording open and the service refuses its
   * append. Letting the refusal escape fails the gateway receive; the WebSocket
   * host then answers `gateway.receive_failed`, which a client reads as a failed
   * connection. The message merely arrived late, so it is counted exactly like
   * one arriving a moment later. Any other failure still propagates.
   *
   * The service refuses with a plain `Error` carrying no code, so the refusal is
   * recognised by re-reading `endedAt` — the condition the service tests before
   * refusing, never cleared once set — rather than by matching the message.
   */
  private async appendOrDiscard<T>(recording: ClientRecordingRef, senders: readonly ClientMessageSender[], append: () => Promise<T>): Promise<T | undefined> {
    try {
      return await append();
    } catch (error) {
      if (!await this.isFinalized(recording)) throw error;
      for (const { session, message } of senders) {
        const ownerKey = this.recordingOwnerKey(session);
        const active = this.activeRecordings.get(ownerKey);
        this.rememberClosedRecording(ownerKey, active?.recordingId === recording.recordingId ? active : recording);
        this.noteDiscardedClientMessage(session, message);
      }
      return undefined;
    }
  }

  private async isFinalized(recording: ClientRecordingRef): Promise<boolean> {
    const stored = await this.automationStudio.getRecordingSession(recording.recordingId, recording.projectId).catch(() => undefined);
    return stored?.endedAt !== undefined;
  }

  private async appendSnapshot(session: ClientGatewaySession, snapshot: ClientGatewaySnapshot, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(this.recordingOwnerKey(session));
    if (!active) return this.noteDiscardedClientMessage(session, { kind: "snapshot", label: `client.${snapshot.kind}_snapshot`, executable: false });
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
        },
        sender: { session, message: { kind: "snapshot", label: "client.state_snapshot", executable: false } }
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
      },
      sender: { session, message: { kind: "snapshot", label: `client.${snapshot.kind}_snapshot`, executable: false } }
    });
  }

  private async appendStateUpdate(session: ClientGatewaySession, stateUpdate: JsonObject, messageId: string): Promise<void> {
    const active = this.activeRecordings.get(this.recordingOwnerKey(session));
    if (!active) {
      // One that says its client is not recording is page state, not lost evidence.
      if (stateUpdate.recording !== false) this.noteDiscardedClientMessage(session, { kind: "state update", label: "client.state_update", domainId: stringMetadataValue(stateUpdate.metadata as JsonObject | undefined, "domainId") ?? null, inputId: stringMetadataValue(stateUpdate.metadata as JsonObject | undefined, "inputId") });
      return;
    }
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
        ...(stateUpdate.metadata && typeof stateUpdate.metadata === "object" && !Array.isArray(stateUpdate.metadata) ? { metadata: stateUpdate.metadata as JsonObject } : {}),
        sender: { session, message: { kind: "state update", label: "client.state_update", domainId, inputId } }
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
      },
      sender: { session, message: { kind: "state update", label: "client.state_update", executable: false } }
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
    sender: ClientMessageSender;
  }): Promise<boolean> {
    if (!this.io?.hasInput(input.domainId, input.inputId)) return false;
    const recorder = new AutomationStudioIoRecorder({
      automationStudio: this.automationStudio,
      io: this.io,
      domainId: input.domainId,
      ...(input.active.projectId !== undefined ? { projectId: input.active.projectId } : {})
    });
    await this.appendOrDiscard(input.active, [input.sender], () => recorder.recordInput(input.active.recordingId, input.inputId, createEnvelope({
      domainId: input.domainId,
      ioId: input.inputId,
      payload: input.payload,
      ...(input.timestampMs !== undefined ? { timestampMs: input.timestampMs } : {}),
      metadata: compactJsonObject({ sourceId: input.sourceId, clientGatewayMessageId: input.messageId, ...(input.metadata ?? {}) })
    })));
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
        const groups = new Map<string, { recording: ClientRecordingRef; entries: RecordingAppendQueueItem["entry"][]; senders: ClientMessageSender[] }>();
        for (const item of batch) {
          const key = `${item.projectId ?? ""}\n${item.recordingId}`;
          const group = groups.get(key) ?? { recording: { ...(item.projectId !== undefined ? { projectId: item.projectId } : {}), recordingId: item.recordingId }, entries: [], senders: [] };
          group.entries.push(item.entry);
          group.senders.push(item.sender);
          groups.set(key, group);
        }
        // Whether a timer or a caller started this flush, an entry queued while
        // the recording was open can reach the service after Stop finalized it.
        for (const { recording, entries, senders } of groups.values()) {
          await this.appendOrDiscard(recording, senders, () => this.automationStudio.appendRecordingEvents({ ...recording, entries }));
        }
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

/** A client's `client.start_recording` still being handled; its later messages wait on `settled`. */
type PendingClientStart = { recordingId: string; settled: Promise<void>; stopRequested: boolean };

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

function discardedClientMessageSummary(
  discarded: DiscardedClientMessage,
  recordingId: string | undefined,
  executable: boolean,
  sinceFinalizedMs: number | undefined
): string {
  const what = executable ? `an executable action (${discarded.label})` : `a client ${discarded.kind} (${discarded.label})`;
  if (!recordingId) return `Discarded ${what} that arrived while this client had no recording open.`;
  const lost = sinceFinalizedMs === undefined
    ? `Discarded ${what} for recording ${recordingId}, which this client did not have open.`
    : `Discarded ${what} that arrived ${sinceFinalizedMs} ms after recording ${recordingId} was finalized.`;
  return executable ? `${lost} The client believes it was recorded; the recording does not contain it.` : lost;
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


