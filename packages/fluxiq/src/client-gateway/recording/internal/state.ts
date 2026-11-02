import type { JsonObject } from "../../../core/index.ts";
import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { ClientGatewayActionCommand } from "../../contracts.ts";
import type { ClientGatewayActionResult } from "../../contracts.ts";
import type { ClientGatewayEvent } from "../../contracts.ts";
import type { ClientGatewayRecordingEvent } from "../../contracts.ts";
import type { ClientGatewaySession } from "../../contracts.ts";
import type { ClientGatewayStartRecordingRequest } from "../../contracts.ts";
import type { ClientGatewayStopRecordingRequest } from "../../contracts.ts";
import type { ClientGatewaySnapshot } from "../../contracts.ts";
import type { StartClientRecordingInput } from "../start-input.ts";
import type { RecordingAppendQueueItem } from "./queued.ts";
import type { ClientMessageSender } from "./sender.ts";
import type { ClosedClientRecording } from "./closed.ts";
import type { PendingClientStart } from "./pending.ts";
import type { ClientRecordingMessageEvent } from "./message.ts";
import type { ClientRecordingRef } from "./ref.ts";
import type { DiscardedClientMessage } from "./discarded.ts";
import { compactJsonObject } from "../values/index.ts";
import type { ClientGatewayRecordingBridgeOptions } from "../options.ts";
import type { RecordingSink, RecordingReadOutcome } from "../../../runtime/recording/sink/index.ts";
import type { RecordingStartPolicy, RecordingIngressPolicy, RecordingStartContext } from "../policies/index.ts";
import type { IoRegistry } from "../../../io/index.ts";
import type { ClientGatewayService } from "../../service.ts";
import { ClientRecordingWriteOrder } from "../writes/index.ts";
import { startRecording } from "../lifecycle/index.ts";
import { stopRecording } from "../lifecycle/index.ts";
import { handleGatewayEvent } from "../capture/index.ts";
import { storeClientMessage } from "../capture/index.ts";
import { startRecordingFromClient } from "../lifecycle/client/index.ts";
import { awaitClientStart } from "../lifecycle/client/index.ts";
import { openClientRecording } from "../lifecycle/client/index.ts";
import { stopRecordingFromClient } from "../lifecycle/client/index.ts";
import { appendRecordingEvent } from "../capture/index.ts";
import { reportRejectedRecordingEvent } from "../diagnostics/index.ts";
import { rememberClosedRecording } from "../lifecycle/index.ts";
import { noteDiscardedClientMessage } from "../diagnostics/index.ts";
import { isExecutableActionInput } from "../diagnostics/index.ts";
import { appendOrDiscard, readRecordingForFinalization, type RecordingAppendResult } from "../writes/index.ts";
import { appendSnapshot } from "../capture/index.ts";
import { appendStateUpdate } from "../capture/index.ts";
import { recordGatewayInput } from "../capture/index.ts";
import { appendActionResult } from "../capture/index.ts";

export class RecordingBridgeState<TTarget, TEvidence> {
  readonly gateway: ClientGatewayService;
  readonly sink: RecordingSink<TTarget, TEvidence>;
  readonly startPolicy: RecordingStartPolicy;
  readonly ingress: RecordingIngressPolicy<TTarget, TEvidence>;
  readonly stopDrainMs: number;
  io: IoRegistry | undefined;
  readonly activeRecordings = new Map<string, ClientRecordingRef>();
  readonly closedRecordings = new Map<string, ClosedClientRecording>();
  readonly pendingStarts = new Map<string, PendingClientStart>();
  readonly writeOrder: ClientRecordingWriteOrder<RecordingAppendQueueItem<TTarget, TEvidence>>;
  constructor(readonly options: ClientGatewayRecordingBridgeOptions<TTarget, TEvidence>) {
    this.gateway = options.gateway;
    this.sink = options.sink;
    this.startPolicy = options.startPolicy;
    this.ingress = options.ingress;
    this.stopDrainMs = Math.max(0, options.stopDrainMs ?? 250);
    this.io = options.io;
    this.writeOrder = new ClientRecordingWriteOrder((recording, items) => this.appendOrDiscard(recording, items.map(item => item.sender), () => this.sink.appendBatch({ ...recording, entries: items.map(item => item.entry) })), failure => {
      this.gateway.recordAuditEvent({ type: "recording.write_failed", message: "Recording entries could not be stored.", metadata: compactJsonObject({ ...this.startPolicy.diagnosticMetadata, ownerKey: failure.ownerKey, recordingId: failure.recording?.recordingId, projectId: failure.recording?.projectId, entryCount: failure.entryCount }) });
      return options.onWriteFailure?.(failure);
    });
  }
  resolveClientRecordingContext(session: ClientGatewaySession, request: ClientGatewayStartRecordingRequest): Promise<RecordingStartContext> { return Promise.resolve(this.startPolicy.context({ session, request, origin: "client" })); }
  session(sessionId: string): ClientGatewaySession {
    const session = this.gateway.snapshot().sessions.find(item => item.sessionId === sessionId);
    if (!session) throw new Error(`Unknown client gateway session: ${sessionId}`);
    return session;
  }
  recordingOwnerKey(session: ClientGatewaySession): string { return session.trustedClientId ? `trusted:${session.trustedClientId}` : `session:${session.sessionId}`; }
  startRecording(input: StartClientRecordingInput): Promise<RecordingSession<TTarget, TEvidence>> { return startRecording(this, input); }
  stopRecording(sessionId: string): Promise<RecordingSession<TTarget, TEvidence> | null> { return stopRecording(this, sessionId); }
  handleGatewayEvent(event: ClientGatewayEvent): Promise<void> { return handleGatewayEvent(this, event); }
  storeClientMessage(event: ClientRecordingMessageEvent): Promise<void> { return storeClientMessage(this, event); }
  startRecordingFromClient(session: ClientGatewaySession, input: ClientGatewayStartRecordingRequest): Promise<RecordingSession<TTarget, TEvidence> | null> { return startRecordingFromClient(this, session, input); }
  awaitClientStart(session: ClientGatewaySession, stoppingRecordingId: string | undefined): Promise<void> { return awaitClientStart(this, session, stoppingRecordingId); }
  openClientRecording(session: ClientGatewaySession, input: ClientGatewayStartRecordingRequest, pending: PendingClientStart): Promise<RecordingSession<TTarget, TEvidence> | null> { return openClientRecording(this, session, input, pending); }
  stopRecordingFromClient(session: ClientGatewaySession, input: ClientGatewayStopRecordingRequest): Promise<RecordingSession<TTarget, TEvidence> | null> { return stopRecordingFromClient(this, session, input); }
  appendRecordingEvent(session: ClientGatewaySession, event: ClientGatewayRecordingEvent, messageId: string): Promise<void> { return appendRecordingEvent(this, session, event, messageId); }
  reportRejectedRecordingEvent(session: ClientGatewaySession, event: ClientGatewayRecordingEvent, messageId: string, reason: string): Promise<void> { return reportRejectedRecordingEvent(this, session, event, messageId, reason); }
  rememberClosedRecording(ownerKey: string, closed: { recordingId: string; projectId?: string | null; domainId?: string | null }, finalized = true): void { return rememberClosedRecording(this, ownerKey, closed, finalized); }
  noteDiscardedClientMessage(session: ClientGatewaySession, discarded: DiscardedClientMessage): void { return noteDiscardedClientMessage(this, session, discarded); }
  isExecutableActionInput(domainId: string | null | undefined, inputId: string | undefined): boolean { return isExecutableActionInput(this, domainId, inputId); }
  appendOrDiscard<T>(recording: ClientRecordingRef, senders: readonly ClientMessageSender[], append: () => Promise<T>): Promise<RecordingAppendResult<T>> { return appendOrDiscard(this, recording, senders, append); }
  readRecordingForFinalization(recording: ClientRecordingRef): Promise<RecordingReadOutcome<TTarget, TEvidence>> { return readRecordingForFinalization(this, recording); }
  appendSnapshot(session: ClientGatewaySession, snapshot: ClientGatewaySnapshot, messageId: string): Promise<void> { return appendSnapshot(this, session, snapshot, messageId); }
  appendStateUpdate(session: ClientGatewaySession, stateUpdate: JsonObject, messageId: string): Promise<void> { return appendStateUpdate(this, session, stateUpdate, messageId); }
  recordGatewayInput(input: {
    active: { projectId?: string | null; recordingId: string; domainId?: string | null };
    domainId: string;
    inputId: string;
    payload: JsonObject;
    timestampMs?: number;
    sourceId: string;
    messageId: string;
    metadata?: JsonObject;
    sender: ClientMessageSender;
  }): Promise<boolean> { return recordGatewayInput(this, input); }
  appendActionResult(sessionId: string, command: ClientGatewayActionCommand, result: ClientGatewayActionResult): Promise<void> { return appendActionResult(this, sessionId, command, result); }
}
